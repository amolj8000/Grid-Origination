/**
 * seed-ercot-real.ts
 *
 * Seeds REAL ERCOT price data from ERCOT CDR (Competitive Data Repository).
 * Downloads Historical RTM and DAM Load Zone + Hub Settlement Point Prices.
 * All data is publicly accessible — no auth required.
 *
 * Data sources (ERCOT CDR report 13061 RTM, 13060 DAM):
 *   https://www.ercot.com/misapp/GetReports.do?reportTypeId=13061
 *   https://www.ercot.com/misapp/GetReports.do?reportTypeId=13060
 *
 * Settlement points (15 total):
 *   Hubs: HB_BUSAVG, HB_HOUSTON, HB_HUBAVG, HB_NORTH, HB_PAN, HB_SOUTH, HB_WEST
 *   Load Zones: LZ_AEN, LZ_CPS, LZ_HOUSTON, LZ_LCRA, LZ_NORTH, LZ_RAYBN, LZ_SOUTH, LZ_WEST
 */

import { db, ercotNodalStatsTable } from "@workspace/db";
import * as https from "node:https";
import * as zlib from "node:zlib";
import * as XLSX from "xlsx";

const CDR = "https://www.ercot.com/misdownload/servlets/mirDownload?mimic_duns=000000000&doclookupId=";

const RTM_IDS: Record<number, string> = {
  2024: "1065471230",
  2025: "1177737535",
  2026: "1238507929",
};
const DAM_IDS: Record<number, string> = {
  2024: "1065468714",
  2025: "1177667469",
  2026: "1238506057",
};

function downloadBuffer(url: string, redirects = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many redirects"));
    let settled = false;
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res): void => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        void downloadBuffer(res.headers.location, redirects + 1).then(resolve).catch(reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        if (settled) return;
        settled = true;
        resolve(Buffer.concat(chunks));
      });
      res.on("error", (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
    }).on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

function extractXlsxFromZip(buf: Buffer): Buffer {
  let eocdOff = buf.length - 22;
  while (eocdOff >= 0 && buf.readUInt32LE(eocdOff) !== 0x06054b50) eocdOff--;
  if (eocdOff < 0) throw new Error("No EOCD in ZIP");

  let cdOff = buf.readUInt32LE(eocdOff + 16);
  const z64Loc = eocdOff - 20;
  if (z64Loc >= 0 && buf.readUInt32LE(z64Loc) === 0x07064b50) {
    const z64Pos = buf.readUInt32LE(z64Loc + 8) + buf.readUInt32LE(z64Loc + 12) * 4294967296;
    if (z64Pos < buf.length && buf.readUInt32LE(z64Pos) === 0x06064b50) {
      cdOff = buf.readUInt32LE(z64Pos + 48) + buf.readUInt32LE(z64Pos + 52) * 4294967296;
    }
  }

  const cdPos = cdOff;
  if (buf.readUInt32LE(cdPos) !== 0x02014b50) throw new Error("No central directory entry");

  let compSize = buf.readUInt32LE(cdPos + 20);
  let localOff = buf.readUInt32LE(cdPos + 42);
  const fnLen = buf.readUInt16LE(cdPos + 28);
  const extraLen = buf.readUInt16LE(cdPos + 30);

  let ep = cdPos + 46 + fnLen, eEnd = ep + extraLen;
  while (ep < eEnd - 3) {
    const tag = buf.readUInt16LE(ep), sz = buf.readUInt16LE(ep + 2);
    if (tag === 0x0001) {
      let p = ep + 4;
      const usz = buf.readUInt32LE(cdPos + 24);
      if (usz === 0xFFFFFFFF && p + 8 <= ep + 4 + sz) p += 8;
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
  return zlib.inflateRawSync(buf.slice(dataStart, dataStart + compSize));
}

function parseDate(s: string): { year: number; month: number; dow: number } {
  const [mm, dd, yyyy] = s.split("/").map(Number);
  return { year: yyyy, month: mm, dow: new Date(yyyy, mm - 1, dd).getDay() };
}

type Key = `${string}|${number}|${number}`;
interface Agg { da: number[]; rt: number[]; onPk: number[]; offPk: number[] }

function key(sp: string, year: number, month: number): Key {
  return `${sp}|${year}|${month}` as Key;
}

function ensureAgg(m: Map<Key, Agg>, k: Key) {
  if (!m.has(k)) m.set(k, { da: [], rt: [], onPk: [], offPk: [] });
  return m.get(k)!;
}

function isOnPeak(hour: number, dow: number) {
  return dow >= 1 && dow <= 5 && hour >= 7 && hour <= 22;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function parseRtmSheet(ws: XLSX.WorkSheet, map: Map<Key, Agg>) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as (string | number)[][];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 7) continue;
    const dateStr = r[0] as string;
    const hour = Number(r[1]);
    const flag = r[3] as string;
    const sp = r[4] as string;
    const price = Number(r[6]);
    if (flag === "Y" || !sp || isNaN(price) || !dateStr?.includes("/")) continue;
    const { year, month, dow } = parseDate(dateStr);
    const k = key(sp, year, month);
    const agg = ensureAgg(map, k);
    agg.rt.push(price);
    if (isOnPeak(hour, dow)) agg.onPk.push(price);
    else agg.offPk.push(price);
  }
}

function parseDamSheet(ws: XLSX.WorkSheet, map: Map<Key, Agg>) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as (string | number)[][];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 5) continue;
    const dateStr = r[0] as string;
    const flag = r[2] as string;
    const sp = r[3] as string;
    const price = Number(r[4]);
    if (flag === "Y" || !sp || isNaN(price) || !dateStr?.includes("/")) continue;
    const { year, month } = parseDate(dateStr);
    const k = key(sp, year, month);
    const agg = ensureAgg(map, k);
    agg.da.push(price);
  }
}

function mean(a: number[]) { return a.length === 0 ? 0 : a.reduce((s, v) => s + v, 0) / a.length; }
function stddev(a: number[]) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}

async function processYear(year: number, map: Map<Key, Agg>) {
  for (const [type, ids] of [["RTM", RTM_IDS], ["DAM", DAM_IDS]] as const) {
    const url = CDR + ids[year as keyof typeof ids];
    console.log(`  [${year}] Downloading ${type}...`);
    const buf = await downloadBuffer(url);
    console.log(`  [${year}] ${type} zip: ${(buf.length / 1024 / 1024).toFixed(1)} MB → extracting XLSX...`);
    const xlBuf = extractXlsxFromZip(buf);
    console.log(`  [${year}] ${type} XLSX: ${(xlBuf.length / 1024 / 1024).toFixed(1)} MB → parsing sheets...`);
    const wb = XLSX.read(xlBuf, { type: "buffer" });
    for (const sn of wb.SheetNames) {
      if (!MONTHS.includes(sn)) continue;
      if (type === "RTM") parseRtmSheet(wb.Sheets[sn], map);
      else parseDamSheet(wb.Sheets[sn], map);
      process.stdout.write(`\r    ${sn} `);
    }
    console.log();
  }
}

async function main() {
  console.log("=== ERCOT Real Price Seed ===");
  console.log("Source: ERCOT CDR (public, no auth) — Reports 13061 RTM + 13060 DAM");
  console.log("Coverage: 2024–2026 YTD, all 15 LZ/HB settlement points\n");

  const map = new Map<Key, Agg>();
  for (const year of [2024, 2025, 2026]) {
    console.log(`[Year ${year}]`);
    await processYear(year, map);
  }

  console.log(`\nAggregated ${map.size} (settlement_point, year, month) combinations`);

  const rows: typeof ercotNodalStatsTable.$inferInsert[] = [];
  for (const [k, agg] of map.entries()) {
    const [sp, ys, ms] = k.split("|");
    const year = Number(ys), month = Number(ms);
    const avgDa = agg.da.length > 0 ? mean(agg.da) : mean(agg.rt);
    const avgRt = agg.rt.length > 0 ? mean(agg.rt) : mean(agg.da);
    const onPkAvg = agg.onPk.length > 0 ? mean(agg.onPk) : avgRt;
    const offPkAvg = agg.offPk.length > 0 ? mean(agg.offPk) : avgRt;
    const sd = stddev(agg.rt.length > 0 ? agg.rt : agg.da);
    const allPrices = agg.rt.length > 0 ? agg.rt : agg.da;
    const negPct = allPrices.length > 0 ? (allPrices.filter(p => p < 0).length / allPrices.length * 100) : 0;
    const minP = allPrices.length > 0 ? Math.min(...allPrices) : 0;
    const maxP = allPrices.length > 0 ? Math.max(...allPrices) : 0;
    rows.push({
      settlementPoint: sp,
      year, month,
      avgDaPrice: avgDa.toFixed(4),
      avgRtPrice: avgRt.toFixed(4),
      stdDev: sd.toFixed(4),
      negPricePercent: negPct.toFixed(3),
      onPeakAvg: onPkAvg.toFixed(4),
      offPeakAvg: offPkAvg.toFixed(4),
      minPrice: minP.toFixed(4),
      maxPrice: maxP.toFixed(4),
      sampleCount: allPrices.length,
    });
  }

  console.log(`\nClearing existing ercot_nodal_stats (all synthetic data)...`);
  await db.delete(ercotNodalStatsTable);

  console.log(`Inserting ${rows.length} real rows in batches...`);
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(ercotNodalStatsTable).values(rows.slice(i, i + BATCH));
    process.stdout.write(`\r  ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }
  console.log(`\n✓ Inserted ${rows.length} real ERCOT LZ+HB price rows.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
