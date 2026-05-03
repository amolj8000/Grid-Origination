/**
 * seed-ercot-api.ts
 *
 * Seeds REAL ERCOT historical settlement point prices via the ERCOT Developer API.
 * Covers: May 2025 – Apr 2026 (12 months) for all settlement point types.
 *
 * PREREQUISITES (one-time setup):
 *   1. Log in to developer.ercot.com with your credentials.
 *   2. Go to Profile → Applications → New Application.
 *   3. Subscribe the application to "Public Reports API" product.
 *   4. Copy the Application's "Client ID" (a UUID like "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx").
 *   5. Set in Replit Secrets: ERCOT_CLIENT_ID = <your-client-id>
 *
 * Already set: ERCOT_USERNAME, ERCOT_PASSWORD, ERCOT_SUBSCRIPTION_KEY
 *
 * API endpoint used:
 *   GET https://api.ercot.com/api/public-reports/np4-190-cd/rtm_spp
 *     Headers: Authorization: Bearer {id_token}
 *              Ocp-Apim-Subscription-Key: {ERCOT_SUBSCRIPTION_KEY}
 *     Params:  deliveryDateFrom, deliveryDateTo, settlementPointType, size
 *
 *   GET https://api.ercot.com/api/public-reports/np6-785-er/dam_spp
 *     (same headers, same params — for DAM prices)
 */

import { db, ercotNodeStatsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import * as https from "node:https";

const CLIENT_ID = process.env.ERCOT_CLIENT_ID;
const USERNAME = process.env.ERCOT_USERNAME;
const PASSWORD = process.env.ERCOT_PASSWORD;
const SUB_KEY = process.env.ERCOT_SUBSCRIPTION_KEY;

if (!CLIENT_ID) {
  console.error("ERROR: ERCOT_CLIENT_ID not set.");
  console.error("  1. Log in to developer.ercot.com");
  console.error("  2. Create an Application and subscribe to 'Public Reports API'");
  console.error("  3. Copy the Application Client ID (UUID)");
  console.error("  4. Set ERCOT_CLIENT_ID=<uuid> in Replit Secrets");
  process.exit(1);
}
if (!USERNAME || !PASSWORD || !SUB_KEY) {
  console.error("ERROR: Missing ERCOT_USERNAME, ERCOT_PASSWORD, or ERCOT_SUBSCRIPTION_KEY");
  process.exit(1);
}

// ── Date range: May 2025 – Apr 2026 ──────────────────────────────────────────
const MONTHS: Array<{ year: number; month: number }> = [];
for (let m = 5; m <= 12; m++) MONTHS.push({ year: 2025, month: m });
for (let m = 1; m <= 4; m++) MONTHS.push({ year: 2026, month: m });

function padZ(n: number) { return String(n).padStart(2, "0"); }
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }

// ── HTTPS helpers ─────────────────────────────────────────────────────────────
function httpsPost(url: string, body: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
    };
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        if (settled) return;
        settled = true;
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
      res.on("error", (e) => { if (!settled) { settled = true; reject(e); } });
    });
    req.on("error", (e) => { if (!settled) { settled = true; reject(e); } });
    req.write(body);
    req.end();
  });
}

function httpsGet(url: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    https.get(url, { headers }, (res): void => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        void httpsGet(res.headers.location, headers).then(resolve).catch(reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        if (settled) return;
        settled = true;
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
      res.on("error", (e) => { if (!settled) { settled = true; reject(e); } });
    }).on("error", (e) => { if (!settled) { settled = true; reject(e); } });
  });
}

// ── Auth: B2C ROPC flow ───────────────────────────────────────────────────────
async function getIdToken(): Promise<string> {
  console.log("Authenticating with ERCOT B2C…");
  const body = new URLSearchParams({
    username: USERNAME!,
    password: PASSWORD!,
    grant_type: "password",
    scope: `openid ${CLIENT_ID} offline_access`,
    client_id: CLIENT_ID!,
    response_type: "id_token",
  }).toString();

  const tokenUrl = "https://ercotb2c.b2clogin.com/ercotb2c.onmicrosoft.com/B2C_1_PUBAPI-ROPC-FLOW/oauth2/v2.0/token";
  const resp = await httpsPost(tokenUrl, body, { "Content-Type": "application/x-www-form-urlencoded" });
  const parsed = JSON.parse(resp) as { id_token?: string; access_token?: string; error?: string; error_description?: string };

  if (parsed.error) {
    throw new Error(`B2C auth failed: ${parsed.error} — ${parsed.error_description}`);
  }
  const token = parsed.id_token ?? parsed.access_token;
  if (!token) throw new Error(`No token in B2C response: ${resp.slice(0, 200)}`);
  console.log("  ✓ Auth token obtained");
  return token;
}

// ── Fetch settlement point prices ─────────────────────────────────────────────
interface ErcotSppRow {
  deliveryDate: string;
  deliveryHour: number;
  settlementPoint: string;
  settlementPointType: string;
  settlementPointPrice: number;
}

async function fetchSpp(
  token: string,
  endpoint: string,
  dateFrom: string,
  dateTo: string,
  spType: "RN" | "HB" | "LZ" | "",
  page = 1,
): Promise<{ data: ErcotSppRow[]; totalPages: number }> {
  const params = new URLSearchParams({
    deliveryDateFrom: dateFrom,
    deliveryDateTo: dateTo,
    size: "10000",
    page: String(page),
  });
  if (spType) params.set("settlementPointType", spType);
  const url = `https://api.ercot.com/api/public-reports/${endpoint}?${params}`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Ocp-Apim-Subscription-Key": SUB_KEY!,
    "Accept": "application/json",
  };
  const respText = await httpsGet(url, headers);
  const resp = JSON.parse(respText) as {
    data?: Array<{ [k: string]: unknown }>;
    totalCount?: number;
    totalPages?: number;
    statusCode?: number;
    message?: string;
  };
  if (resp.statusCode && resp.statusCode >= 400) {
    throw new Error(`API error ${resp.statusCode}: ${resp.message}`);
  }
  const rows: ErcotSppRow[] = (resp.data ?? []).map(r => ({
    deliveryDate: String(r["deliveryDate"] ?? r["DeliveryDate"] ?? ""),
    deliveryHour: Number(r["deliveryHour"] ?? r["DeliveryHour"] ?? 0),
    settlementPoint: String(r["settlementPoint"] ?? r["SettlementPointName"] ?? ""),
    settlementPointType: String(r["settlementPointType"] ?? r["SettlementPointType"] ?? ""),
    settlementPointPrice: Number(r["settlementPointPrice"] ?? r["SettlementPointPrice"] ?? 0),
  }));
  return { data: rows, totalPages: resp.totalPages ?? 1 };
}

// ── Aggregation helpers ───────────────────────────────────────────────────────
interface Agg { rt: number[]; da: number[]; onPk: number[]; offPk: number[] }
type Key = `${string}|${number}|${number}`;

function isWeekdayOnPeak(dateStr: string, hour: number): boolean {
  const d = new Date(dateStr);
  const dow = d.getDay();
  return dow >= 1 && dow <= 5 && hour >= 7 && hour <= 22;
}
function mean(a: number[]) { return a.length === 0 ? 0 : a.reduce((s, v) => s + v, 0) / a.length; }
function stddev(a: number[]) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}

function accumulate(rows: ErcotSppRow[], aggMap: Map<Key, Agg>, priceField: "rt" | "da") {
  for (const row of rows) {
    if (!row.settlementPoint || !row.deliveryDate) continue;
    const d = new Date(row.deliveryDate);
    if (isNaN(d.getTime())) continue;
    const year = d.getFullYear(), month = d.getMonth() + 1;
    const k: Key = `${row.settlementPoint}|${year}|${month}`;
    if (!aggMap.has(k)) aggMap.set(k, { rt: [], da: [], onPk: [], offPk: [] });
    const agg = aggMap.get(k)!;
    agg[priceField].push(row.settlementPointPrice);
    if (priceField === "rt") {
      if (isWeekdayOnPeak(row.deliveryDate, row.deliveryHour)) agg.onPk.push(row.settlementPointPrice);
      else agg.offPk.push(row.settlementPointPrice);
    }
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== ERCOT API Historical Seed ===");
  console.log("Coverage: May 2025 – Apr 2026 (12 months), all settlement point types\n");

  const token = await getIdToken();
  const aggMap = new Map<Key, Agg>();

  for (const { year, month } of MONTHS) {
    const lastDay = daysInMonth(year, month);
    const dateFrom = `${year}-${padZ(month)}-01`;
    const dateTo = `${year}-${padZ(month)}-${padZ(lastDay)}`;
    const label = `${year}-${padZ(month)}`;

    for (const [endpointPath, priceField] of [
      ["np4-190-cd/rtm_spp", "rt"],
      ["np6-785-er/dam_spp", "da"],
    ] as const) {
      process.stdout.write(`  [${label}] ${priceField.toUpperCase()} …`);
      try {
        let page = 1;
        let totalPages = 1;
        let total = 0;
        do {
          const { data, totalPages: tp } = await fetchSpp(token, endpointPath, dateFrom, dateTo, "", page);
          totalPages = tp;
          accumulate(data, aggMap, priceField);
          total += data.length;
          page++;
          if (page <= totalPages) await sleep(300);
        } while (page <= totalPages);
        process.stdout.write(` ${total.toLocaleString()} rows\n`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        process.stdout.write(` ERROR: ${msg.slice(0, 80)}\n`);
      }
      await sleep(500);
    }
  }

  console.log(`\nAggregated ${aggMap.size} (node, year, month) combinations`);

  // Delete existing resource_node rows for the months we fetched
  for (const { year, month } of MONTHS) {
    await db.delete(ercotNodeStatsTable).where(
      and(
        eq(ercotNodeStatsTable.nodeType, "resource_node"),
        eq(ercotNodeStatsTable.year, year),
        eq(ercotNodeStatsTable.month, month),
      )
    );
  }

  const insertRows: typeof ercotNodeStatsTable.$inferInsert[] = [];
  for (const [k, agg] of aggMap.entries()) {
    const [node, ys, ms] = k.split("|");
    const year = Number(ys), month = Number(ms);
    if (!node || isNaN(year) || isNaN(month)) continue;
    const avgRt = mean(agg.rt.length > 0 ? agg.rt : agg.da);
    const avgDa = mean(agg.da.length > 0 ? agg.da : agg.rt);
    const allPrices = [...agg.rt, ...agg.da];
    const sd = stddev(agg.rt.length > 0 ? agg.rt : agg.da);
    const onPk = agg.onPk.length > 0 ? mean(agg.onPk) : avgRt;
    const offPk = agg.offPk.length > 0 ? mean(agg.offPk) : avgRt;
    const negPct = allPrices.length > 0 ? (allPrices.filter(p => p < 0).length / allPrices.length) * 100 : 0;
    const minP = allPrices.length > 0 ? Math.min(...allPrices) : 0;
    const maxP = allPrices.length > 0 ? Math.max(...allPrices) : 0;
    insertRows.push({
      node, nodeType: "resource_node", year, month,
      avgDaPrice: avgDa.toFixed(4),
      avgRtPrice: avgRt.toFixed(4),
      volatility: sd.toFixed(4),
      negPricePercent: negPct.toFixed(3),
      onPeakAvg: onPk.toFixed(4),
      offPeakAvg: offPk.toFixed(4),
      minPrice: minP.toFixed(4),
      maxPrice: maxP.toFixed(4),
    });
  }

  console.log(`Inserting ${insertRows.length} rows…`);
  for (let i = 0; i < insertRows.length; i += 500) {
    await db.insert(ercotNodeStatsTable).values(insertRows.slice(i, i + 500));
    process.stdout.write(`\r  ${Math.min(i + 500, insertRows.length)}/${insertRows.length}`);
  }

  const totalCount = await db.select({ count: sql<number>`count(*)` }).from(ercotNodeStatsTable);
  console.log(`\n\n✓ Done. DB total: ${totalCount[0]?.count} ercot_node_stats rows`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
