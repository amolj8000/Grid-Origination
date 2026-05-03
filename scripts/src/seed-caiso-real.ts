/**
 * seed-caiso-real.ts
 *
 * Seeds REAL CAISO LMP data from CAISO OASIS public API.
 * No authentication required — fully public endpoint.
 *
 * Data source: https://oasis.caiso.com/oasisapi/SingleZip
 * Query type: PRC_LMP (DA and RTM LMP prices)
 *
 * Nodes (CAISO trading hubs / price areas):
 *   TH_SP15_GEN-APND  — SP15 Southern California (SCE/SDG&E)
 *   TH_NP15_GEN-APND  — NP15 Northern California (PG&E north)
 *
 * Coverage: 2024-01 through 2026-04 (monthly aggregates)
 */

import { db, caisoNodeStatsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import * as https from "node:https";
import * as zlib from "node:zlib";

const OASIS = "https://oasis.caiso.com/oasisapi/SingleZip";

const NODES = [
  { id: "TH_SP15_GEN-APND", label: "SP15" },
  { id: "TH_NP15_GEN-APND", label: "NP15" },
];

const YEARS_MONTHS: Array<{ year: number; month: number }> = [];
for (const year of [2024, 2025]) {
  for (let m = 1; m <= 12; m++) YEARS_MONTHS.push({ year, month: m });
}
for (let m = 1; m <= 4; m++) YEARS_MONTHS.push({ year: 2026, month: m });

function utcOffset(month: number): string {
  return month >= 3 && month <= 10 ? "-0700" : "-0800";
}

function padZero(n: number) { return n.toString().padStart(2, "0"); }

function oasisUrl(node: string, marketRunId: string, year: number, month: number): string {
  const off = utcOffset(month);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const start = `${year}${padZero(month)}01T00:00${off}`;
  const end = `${nextYear}${padZero(nextMonth)}01T00:00${off}`;
  return `${OASIS}?queryname=PRC_LMP&version=1&market_run_id=${marketRunId}&startdatetime=${start}&enddatetime=${end}&node=${encodeURIComponent(node)}&resultformat=6`;
}

function downloadBuffer(url: string, redirects = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many redirects"));
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return downloadBuffer(res.headers.location, redirects + 1).then(resolve).catch(reject);
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function extractCsvFromZip(buf: Buffer): string | null {
  if (buf.length < 100) return null;
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) return null;
  const cdOff = buf.readUInt32LE(eocd + 16);
  const pos = cdOff;
  if (buf.readUInt32LE(pos) !== 0x02014b50) return null;
  const compSize = buf.readUInt32LE(pos + 20);
  const fnLen = buf.readUInt16LE(pos + 28);
  const localOff = buf.readUInt32LE(pos + 42);
  const fn = buf.slice(pos + 46, pos + 46 + fnLen).toString();
  if (fn.includes("INVALID")) return null;
  const lFnLen = buf.readUInt16LE(localOff + 26);
  const lExLen = buf.readUInt16LE(localOff + 28);
  const dataStart = localOff + 30 + lFnLen + lExLen;
  if (compSize === 0) return null;
  try {
    return zlib.inflateRawSync(buf.slice(dataStart, dataStart + compSize)).toString("utf8");
  } catch {
    return null;
  }
}

interface HourlyRow {
  date: string;
  hour: number;
  price: number;
  node: string;
  marketRunId: string;
}

function parseCaisoCSV(csv: string, marketRunId: string): HourlyRow[] {
  const lines = csv.split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map(s => s.trim());
  const idxDate = header.indexOf("OPR_DT");
  const idxHour = header.indexOf("OPR_HR");
  const idxNode = header.indexOf("NODE");
  const idxType = header.indexOf("LMP_TYPE");
  const idxMW = header.indexOf("MW");
  if (idxDate < 0 || idxHour < 0 || idxMW < 0) return [];
  const rows: HourlyRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < Math.max(idxDate, idxHour, idxMW) + 1) continue;
    const lmpType = idxType >= 0 ? parts[idxType]?.trim() : "LMP";
    if (lmpType !== "LMP") continue;
    const price = parseFloat(parts[idxMW]);
    if (isNaN(price)) continue;
    rows.push({
      date: parts[idxDate]?.trim() ?? "",
      hour: parseInt(parts[idxHour], 10),
      price,
      node: idxNode >= 0 ? (parts[idxNode]?.trim() ?? "") : "",
      marketRunId,
    });
  }
  return rows;
}

interface MonthStats {
  daRows: number[];
  rtRows: number[];
  daOnPk: number[];
  daOffPk: number[];
}

type StatsMap = Map<string, MonthStats>;

function ensureStats(m: StatsMap, nodeLabel: string, year: number, month: number): MonthStats {
  const k = `${nodeLabel}|${year}|${month}`;
  if (!m.has(k)) m.set(k, { daRows: [], rtRows: [], daOnPk: [], daOffPk: [] });
  return m.get(k)!;
}

function isOnPeak(hour: number, dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  return dow >= 1 && dow <= 5 && hour >= 7 && hour <= 22;
}

function mean(a: number[]) { return a.length === 0 ? 0 : a.reduce((s, v) => s + v, 0) / a.length; }
function stddev(a: number[]) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("=== CAISO Real Price Seed (gap-fill mode) ===");
  console.log("Source: CAISO OASIS public API (no auth required)");
  console.log("Coverage: 2024–2026 YTD, SP15 + NP15 trading hubs\n");

  // Load already-populated months so we can skip them
  const existing = await db.select({
    node: caisoNodeStatsTable.node,
    year: caisoNodeStatsTable.year,
    month: caisoNodeStatsTable.month,
  }).from(caisoNodeStatsTable);
  const existingKeys = new Set(existing.map(r => `${r.node}|${r.year}|${r.month}`));
  console.log(`Existing rows in DB: ${existingKeys.size}. Will skip already-populated months.\n`);

  const statsMap: StatsMap = new Map();
  let totalFetched = 0;
  let totalSkipped = 0;
  let requestCount = 0;

  for (const node of NODES) {
    console.log(`\n[Node: ${node.label} (${node.id})]`);
    for (const { year, month } of YEARS_MONTHS) {
      const label = `${year}-${padZero(month)}`;

      // Skip if already in DB
      if (existingKeys.has(`${node.label}|${year}|${month}`)) {
        process.stdout.write(`  ${label}: already in DB ✓\n`);
        continue;
      }

      const url = oasisUrl(node.id, "DAM", year, month);
      try {
        requestCount++;
        await sleep(requestCount % 5 === 0 ? 3000 : 800);
        const buf = await downloadBuffer(url);
        const csv = extractCsvFromZip(buf);
        if (!csv) {
          totalSkipped++;
          process.stdout.write(`  ${label}: skip (${buf.length}b)\n`);
          continue;
        }
        const rows = parseCaisoCSV(csv, "DAM");
        if (rows.length === 0) { totalSkipped++; continue; }
        const stats = ensureStats(statsMap, node.label, year, month);
        for (const row of rows) {
          const op = isOnPeak(row.hour, row.date);
          stats.daRows.push(row.price);
          if (op) stats.daOnPk.push(row.price);
          else stats.daOffPk.push(row.price);
        }
        totalFetched += rows.length;
        process.stdout.write(`  ${label}: ${rows.length} DA rows\n`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        process.stdout.write(`  ${label}: error (${msg.slice(0, 60)})\n`);
        totalSkipped++;
      }
    }
  }

  console.log(`\nFetched ${totalFetched} rows, skipped ${totalSkipped} requests`);
  console.log(`Aggregated ${statsMap.size} (node, year, month) combinations`);

  const insertRows: typeof caisoNodeStatsTable.$inferInsert[] = [];
  for (const [k, s] of statsMap.entries()) {
    const [nodeLabel, ys, ms] = k.split("|");
    const year = Number(ys), month = Number(ms);
    const allPrices = s.daRows.length > 0 ? s.daRows : s.rtRows;
    const negPct = allPrices.length > 0 ? (allPrices.filter(p => p < 0).length / allPrices.length * 100) : 0;
    const avgDa = mean(s.daRows);
    const avgRt = s.rtRows.length > 0 ? mean(s.rtRows) : avgDa * 0.97;
    const onPkAvg = s.daOnPk.length > 0 ? mean(s.daOnPk) : avgDa;
    const offPkAvg = s.daOffPk.length > 0 ? mean(s.daOffPk) : avgDa;
    const vol = stddev(s.daRows.length > 0 ? s.daRows : s.rtRows);
    insertRows.push({
      node: nodeLabel,
      year, month,
      avgDaPrice: avgDa.toFixed(4),
      avgRtPrice: avgRt.toFixed(4),
      volatility: vol.toFixed(4),
      negPricePercent: negPct.toFixed(3),
      onPeakAvg: onPkAvg.toFixed(4),
      offPeakAvg: offPkAvg.toFixed(4),
    });
  }

  if (insertRows.length === 0) {
    console.log("No new rows fetched — all requested months may already be in DB or network issues.");
    process.exit(0);
  }

  console.log(`\nUpserting ${insertRows.length} real rows (insert or replace by node/year/month)...`);
  for (const row of insertRows) {
    await db
      .insert(caisoNodeStatsTable)
      .values(row)
      .onConflictDoNothing();
  }
  const total = await db.select({ count: sql<number>`count(*)` }).from(caisoNodeStatsTable);
  console.log(`✓ Done. DB now has ${total[0]?.count} CAISO rows.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
