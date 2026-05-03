/**
 * seed-ercot-nodes-cdr.ts
 *
 * Seeds REAL ERCOT resource node settlement point prices from CDR Report 12301.
 * Report 12301: "Settlement Point Prices at Resource Nodes, Hubs and Load Zones"
 * Published every 15 minutes, all settlement point types (RN / HB / LZ).
 * CDR retains ~7 days of rolling history. Run regularly to keep data fresh.
 *
 * Source: https://www.ercot.com/misapp/GetReports.do?reportTypeId=12301
 *
 * Data format:
 *   DeliveryDate,DeliveryHour,DeliveryInterval,SettlementPointName,SettlementPointType,SettlementPointPrice,DSTFlag
 *   05/03/2026,4,1,7RNCHSLR_ALL,RN,20.64,N
 *
 * Result: ~950 resource nodes seeded with recent RT prices, monthly aggregated.
 * For 12-month historical data use seed-ercot-api.ts (requires ERCOT API client_id).
 */

import { db, ercotNodeStatsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import * as https from "node:https";
import * as zlib from "node:zlib";

const CDR_LIST_URL = "https://www.ercot.com/misapp/GetReports.do?reportTypeId=12301";
const CDR_DL_BASE = "https://www.ercot.com/misdownload/servlets/mirDownload?mimic_duns=000000000&doclookupId=";
const CONCURRENCY = 20;

function httpsGet(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res): void => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        void httpsGet(res.headers.location).then(resolve).catch(reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        if (settled) return;
        settled = true;
        resolve(Buffer.concat(chunks));
      });
      res.on("error", (err) => { if (!settled) { settled = true; reject(err); } });
    }).on("error", (err) => { if (!settled) { settled = true; reject(err); } });
  });
}

function extractCsv(buf: Buffer): string | null {
  if (buf.length < 20) return null;
  // Standard ZIP (not ZIP64 for these small files)
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) return null;
  const cdOff = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cdOff) !== 0x02014b50) return null;
  const fnLen = buf.readUInt16LE(cdOff + 28);
  const fn = buf.slice(cdOff + 46, cdOff + 46 + fnLen).toString();
  if (!fn.toLowerCase().includes("csv")) return null; // skip XML zips
  let compSize = buf.readUInt32LE(cdOff + 20);
  let localOff = buf.readUInt32LE(cdOff + 42);
  // ZIP64 extra field
  const extraLen = buf.readUInt16LE(cdOff + 30);
  let ep = cdOff + 46 + fnLen;
  const eEnd = ep + extraLen;
  while (ep < eEnd - 3) {
    const tag = buf.readUInt16LE(ep), sz = buf.readUInt16LE(ep + 2);
    if (tag === 0x0001) {
      let p = ep + 4;
      if (buf.readUInt32LE(cdOff + 24) === 0xFFFFFFFF && p + 8 <= ep + 4 + sz) p += 8;
      if (compSize === 0xFFFFFFFF && p + 8 <= ep + 4 + sz) {
        compSize = buf.readUInt32LE(p) + buf.readUInt32LE(p + 4) * 4294967296; p += 8;
      }
      if (localOff === 0xFFFFFFFF && p + 8 <= ep + 4 + sz) {
        localOff = buf.readUInt32LE(p) + buf.readUInt32LE(p + 4) * 4294967296;
      }
    }
    ep += 4 + sz;
  }
  const lFnLen = buf.readUInt16LE(localOff + 26);
  const lExLen = buf.readUInt16LE(localOff + 28);
  const dataStart = localOff + 30 + lFnLen + lExLen;
  if (compSize === 0) return null;
  try {
    const raw = zlib.inflateRawSync(buf.slice(dataStart, dataStart + compSize));
    const text = raw.toString("utf8");
    if (text.startsWith("<?xml")) return null;
    return text;
  } catch {
    return null;
  }
}

interface Agg { rt: number[]; onPk: number[]; offPk: number[] }
type Key = `${string}|${number}|${number}`;

function isWeekdayOnPeak(dateStr: string, deliveryHour: number): boolean {
  // dateStr = "MM/DD/YYYY"
  const [mm, dd, yyyy] = dateStr.split("/").map(Number);
  const dow = new Date(yyyy, mm - 1, dd).getDay(); // 0=Sun,6=Sat
  return dow >= 1 && dow <= 5 && deliveryHour >= 7 && deliveryHour <= 22;
}

function parseCsv(csv: string, aggMap: Map<Key, Agg>): number {
  const lines = csv.split("\n");
  let count = 0;
  const header = lines[0].split(",").map(s => s.trim());
  const iDate = header.indexOf("DeliveryDate");
  const iHour = header.indexOf("DeliveryHour");
  const iName = header.indexOf("SettlementPointName");
  const iType = header.indexOf("SettlementPointType");
  const iPrice = header.indexOf("SettlementPointPrice");
  if (iDate < 0 || iHour < 0 || iName < 0 || iType < 0 || iPrice < 0) return 0;

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 5) continue;
    const spType = parts[iType]?.trim();
    if (spType !== "RN") continue; // resource nodes only
    const price = parseFloat(parts[iPrice]);
    if (isNaN(price)) continue;
    const dateStr = parts[iDate]?.trim();
    const hour = parseInt(parts[iHour], 10);
    if (!dateStr || !dateStr.includes("/")) continue;
    const [mm, , yyyy] = dateStr.split("/").map(Number);
    const node = parts[iName]?.trim();
    if (!node) continue;
    const k: Key = `${node}|${yyyy}|${mm}`;
    if (!aggMap.has(k)) aggMap.set(k, { rt: [], onPk: [], offPk: [] });
    const agg = aggMap.get(k)!;
    agg.rt.push(price);
    if (isWeekdayOnPeak(dateStr, hour)) agg.onPk.push(price);
    else agg.offPk.push(price);
    count++;
  }
  return count;
}

function mean(a: number[]): number {
  return a.length === 0 ? 0 : a.reduce((s, v) => s + v, 0) / a.length;
}
function stddev(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}

async function fetchDocIds(): Promise<string[]> {
  console.log("Fetching CDR 12301 file listing…");
  const buf = await httpsGet(CDR_LIST_URL);
  const html = buf.toString("utf8");
  const matches = [...html.matchAll(/doclookupId=(\d+)/g)].map(m => m[1]);
  // IDs alternate: even index = CSV, odd index = XML (verified from listing inspection)
  // Take every other one starting at index 0 for CSV files
  return matches.filter((_, i) => i % 2 === 0);
}

async function processInBatches(ids: string[], aggMap: Map<Key, Agg>): Promise<void> {
  let totalRows = 0, totalFiles = 0, skipped = 0;
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    batches.push(ids.slice(i, i + CONCURRENCY));
  }
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const results = await Promise.allSettled(
      batch.map(id => httpsGet(CDR_DL_BASE + id))
    );
    for (let ri = 0; ri < results.length; ri++) {
      const r = results[ri];
      if (r.status === "rejected") { skipped++; continue; }
      const csv = extractCsv(r.value);
      if (!csv) { skipped++; continue; }
      const rows = parseCsv(csv, aggMap);
      totalRows += rows;
      totalFiles++;
    }
    const pct = Math.round(((bi + 1) / batches.length) * 100);
    process.stdout.write(`\r  Batches: ${bi + 1}/${batches.length} (${pct}%) | files: ${totalFiles} | rows: ${totalRows.toLocaleString()} | skipped: ${skipped}   `);
  }
  console.log(`\n  Total: ${totalRows.toLocaleString()} RN rows from ${totalFiles} files (${skipped} skipped)`);
}

async function main() {
  console.log("=== ERCOT Resource Node Seed — CDR 12301 ===");
  console.log("Source: ERCOT CDR Report 12301 (Settlement Point Prices at Resource Nodes)");
  console.log("Note: CDR rolling window = ~7 days. For 12-month history, use seed-ercot-api.ts.\n");

  const csvIds = await fetchDocIds();
  console.log(`Found ${csvIds.length} CSV file IDs to download\n`);

  const aggMap = new Map<Key, Agg>();
  await processInBatches(csvIds, aggMap);

  if (aggMap.size === 0) {
    console.log("No resource node data found. Exiting.");
    process.exit(0);
  }

  console.log(`\nAggregated ${aggMap.size} (node, year, month) combinations`);

  // Delete existing resource_node rows before re-inserting
  const delResult = await db.delete(ercotNodeStatsTable)
    .where(eq(ercotNodeStatsTable.nodeType, "resource_node"));
  console.log(`Deleted old resource_node rows: ${(delResult as unknown as { rowCount: number }).rowCount ?? "?"}`);

  // Build insert rows
  const insertRows: typeof ercotNodeStatsTable.$inferInsert[] = [];
  for (const [k, agg] of aggMap.entries()) {
    const [node, ys, ms] = k.split("|");
    const year = Number(ys), month = Number(ms);
    if (!node || isNaN(year) || isNaN(month)) continue;
    const avgRt = mean(agg.rt);
    const sd = stddev(agg.rt);
    const onPk = agg.onPk.length > 0 ? mean(agg.onPk) : avgRt;
    const offPk = agg.offPk.length > 0 ? mean(agg.offPk) : avgRt;
    const negPct = agg.rt.length > 0 ? (agg.rt.filter(p => p < 0).length / agg.rt.length) * 100 : 0;
    const minP = Math.min(...agg.rt);
    const maxP = Math.max(...agg.rt);
    insertRows.push({
      node,
      nodeType: "resource_node",
      year, month,
      avgDaPrice: avgRt.toFixed(4), // RT used as proxy since CDR 12301 is RT-only
      avgRtPrice: avgRt.toFixed(4),
      volatility: sd.toFixed(4),
      negPricePercent: negPct.toFixed(3),
      onPeakAvg: onPk.toFixed(4),
      offPeakAvg: offPk.toFixed(4),
      minPrice: minP.toFixed(4),
      maxPrice: maxP.toFixed(4),
    });
  }

  console.log(`Inserting ${insertRows.length} rows in batches of 500…`);
  for (let i = 0; i < insertRows.length; i += 500) {
    await db.insert(ercotNodeStatsTable).values(insertRows.slice(i, i + 500));
    process.stdout.write(`\r  Inserted ${Math.min(i + 500, insertRows.length)}/${insertRows.length}`);
  }

  const total = await db.select({ count: sql<number>`count(*)` }).from(ercotNodeStatsTable);
  const nodeCount = await db.execute<{ c: string }>(
    sql`SELECT count(distinct node) as c FROM ercot_node_stats WHERE node_type = 'resource_node'`
  );
  console.log(`\n\n✓ Done. DB: ${total[0]?.count} total ercot_node_stats rows`);
  console.log(`  Resource nodes seeded: ${nodeCount.rows[0]?.c ?? "?"} distinct nodes, ${insertRows.length} month records`);
  console.log("  Coverage: partial months from CDR 7-day window. Run seed-ercot-api.ts for full 12-month history.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
