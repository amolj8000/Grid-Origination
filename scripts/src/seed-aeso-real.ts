/**
 * Seed REAL AESO data from apimgw.aeso.ca public API gateway
 * Requires: AESO_API_KEY environment variable
 *
 * Pulls (Jan 2024 → today unless noted):
 *   1. Pool Price            — actual + forecast + rolling 30d avg
 *   2. Actual/Forecast AIL   — actual + DA/RT forecasts + price forecasts
 *   3. AIES Gen Capacity     — unit-level capacity & outage reporting
 *   4. Operating Reserve     — FFR, contingency, spinning, supplemental
 *   5. Load Outage Forecast  — last 90 days
 *   6. Metered Volume        — last 30 days (generator-level, large dataset)
 *   7. Asset List            — one-time registry pull
 *   8. Pool Participants     — one-time registry pull
 *
 * Usage:
 *   AESO_API_KEY=<key> pnpm --filter @workspace/scripts run seed-aeso-real
 *
 * Gap-fill: skips months already fully populated in pool_price.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const _rawKey = process.env.AESO_API_KEY;
if (!_rawKey) {
  console.error("❌  AESO_API_KEY not set. Register free at https://developer-apim.aeso.ca");
  process.exit(1);
}
const API_KEY: string = _rawKey;

const BASE = "https://apimgw.aeso.ca/public";
const HEADERS: Record<string, string> = { "API-KEY": API_KEY };
const DELAY_MS = 400;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Date utilities ─────────────────────────────────────────────────────────

/** Parse AESO datetime strings: "01/01/2024 HE01" or "2024-01-01 HE01" */
function parseAesoDatetime(dt: string): { date: string; hourEnding: number } {
  const heMatch = dt.match(/HE(\d+)/i);
  const hourEnding = heMatch ? parseInt(heMatch[1], 10) : 1;

  // MM/DD/YYYY HE##
  const mdyMatch = dt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    return { date: `${y}-${m}-${d}`, hourEnding };
  }
  // YYYY-MM-DD HE##
  const ymdMatch = dt.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return { date: `${y}-${m}-${d}`, hourEnding };
  }
  throw new Error(`Cannot parse AESO datetime: "${dt}"`);
}

/** Generate month windows from startYear/startMonth to today */
function* monthRange(startYear: number, startMonth: number): Generator<{ startDate: string; endDate: string; label: string }> {
  const today = new Date();
  let year = startYear;
  let month = startMonth;
  while (year < today.getFullYear() || (year === today.getFullYear() && month <= today.getMonth() + 1)) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    const endCapped = end > today ? today : end;
    yield {
      startDate: start.toISOString().slice(0, 10),
      endDate: endCapped.toISOString().slice(0, 10),
      label: `${year}-${String(month).padStart(2, "0")}`,
    };
    month++;
    if (month > 12) { month = 1; year++; }
  }
}

/** Offset a date by N days */
function offsetDate(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

async function aFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url.toString(), { headers: HEADERS });
      if (res.status === 429) {
        console.warn(`    ⏳ Rate limited — waiting 5s (attempt ${attempt})`);
        await sleep(5000 * attempt);
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} from ${path}: ${body.slice(0, 300)}`);
      }
      return await res.json();
    } catch (e) {
      lastErr = e as Error;
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }
  throw lastErr!;
}

function safeFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

// ─── 1. Pool Price ───────────────────────────────────────────────────────────

async function seedPoolPrice(): Promise<void> {
  console.log("\n📈 Seeding pool price (Jan 2024 → today)...");
  let total = 0;

  // Check existing months to skip already-complete months
  const existingRes = await db.execute(sql`
    SELECT EXTRACT(YEAR FROM date)::int AS y,
           EXTRACT(MONTH FROM date)::int AS m,
           COUNT(*) AS cnt
    FROM aeso_pool_price
    GROUP BY y, m
  `);
  const existing = new Set<string>(
    existingRes.rows.map((r: Record<string, unknown>) => `${r["y"]}-${String(r["m"]).padStart(2, "0")}`)
  );

  for (const { startDate, endDate, label } of monthRange(2024, 1)) {
    if (existing.has(label)) {
      console.log(`  ✓ Pool price ${label} already seeded`);
      continue;
    }
    try {
      const data = await aFetch("poolprice-api/v1.1/price/poolPrice", { startDate, endDate }) as Record<string, unknown>;
      const rows = (data as Record<string, Record<string, unknown[]>>)?.return?.["Pool Price Report"] ?? [];

      if (!Array.isArray(rows) || rows.length === 0) {
        console.log(`  ⚠️  Pool price ${label}: empty response`);
        await sleep(DELAY_MS);
        continue;
      }

      const values = rows.map((r: Record<string, unknown>) => {
        const dt = parseAesoDatetime(String(r["begin_datetime_mpt"] ?? ""));
        return `(
          '${dt.date}', ${dt.hourEnding},
          ${safeFloat(r["pool_price"]) ?? "NULL"},
          ${safeFloat(r["forecast_pool_price"]) ?? "NULL"},
          ${safeFloat(r["rolling_30day_avg"]) ?? "NULL"}
        )`;
      }).join(",\n");

      await db.execute(sql.raw(`
        INSERT INTO aeso_pool_price (date, hour_ending, pool_price, forecast_pool_price, rolling_30d_avg)
        VALUES ${values}
        ON CONFLICT (date, hour_ending) DO UPDATE SET
          pool_price             = EXCLUDED.pool_price,
          forecast_pool_price    = EXCLUDED.forecast_pool_price,
          rolling_30d_avg        = EXCLUDED.rolling_30d_avg
      `));
      total += rows.length;
      console.log(`  ✓ Pool price ${label}: ${rows.length} rows`);
    } catch (e: unknown) {
      console.error(`  ❌ Pool price ${label}: ${(e as Error).message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`  Pool price total: ${total} rows`);
}

// ─── 2. Actual / Forecast AIL ────────────────────────────────────────────────

async function seedActualForecast(): Promise<void> {
  console.log("\n📊 Seeding actual/forecast AIL (Jan 2024 → today)...");
  let total = 0;

  const existingRes = await db.execute(sql`
    SELECT EXTRACT(YEAR FROM date)::int AS y, EXTRACT(MONTH FROM date)::int AS m
    FROM aeso_actual_forecast
    GROUP BY y, m
  `);
  const existing = new Set<string>(
    existingRes.rows.map((r: Record<string, unknown>) => `${r["y"]}-${String(r["m"]).padStart(2, "0")}`)
  );

  for (const { startDate, endDate, label } of monthRange(2024, 1)) {
    if (existing.has(label)) {
      console.log(`  ✓ ActualForecast ${label} already seeded`);
      continue;
    }
    try {
      const data = await aFetch("actualforecast-api/v1/load/albertaInternalLoad", { startDate, endDate }) as Record<string, unknown>;
      const rows = (data as Record<string, Record<string, unknown[]>>)?.return?.["Actual Forecast Report"] ?? [];

      if (!Array.isArray(rows) || rows.length === 0) {
        console.log(`  ⚠️  ActualForecast ${label}: empty`);
        await sleep(DELAY_MS);
        continue;
      }

      const values = rows.map((r: Record<string, unknown>) => {
        const dt = parseAesoDatetime(String(r["begin_datetime_mpt"] ?? ""));
        return `(
          '${dt.date}', ${dt.hourEnding},
          ${safeFloat(r["actual_posted_pool_price"]) ?? "NULL"},
          ${safeFloat(r["day_ahead_forecast_pool_price"]) ?? "NULL"},
          ${safeFloat(r["real_time_forecast_pool_price"]) ?? "NULL"},
          ${safeFloat(r["forecast_ail"]) ?? "NULL"},
          ${safeFloat(r["actual_ail"]) ?? "NULL"},
          ${safeFloat(r["forecast_ail_and_actual_ail_difference"]) ?? "NULL"}
        )`;
      }).join(",\n");

      await db.execute(sql.raw(`
        INSERT INTO aeso_actual_forecast
          (date, hour_ending, actual_pool_price, day_ahead_forecast_pool_price,
           rt_forecast_pool_price, forecast_ail_mw, actual_ail_mw, ail_forecast_error_mw)
        VALUES ${values}
        ON CONFLICT (date, hour_ending) DO UPDATE SET
          actual_pool_price              = EXCLUDED.actual_pool_price,
          day_ahead_forecast_pool_price  = EXCLUDED.day_ahead_forecast_pool_price,
          rt_forecast_pool_price         = EXCLUDED.rt_forecast_pool_price,
          forecast_ail_mw                = EXCLUDED.forecast_ail_mw,
          actual_ail_mw                  = EXCLUDED.actual_ail_mw,
          ail_forecast_error_mw          = EXCLUDED.ail_forecast_error_mw
      `));
      total += rows.length;
      console.log(`  ✓ ActualForecast ${label}: ${rows.length} rows`);
    } catch (e: unknown) {
      console.error(`  ❌ ActualForecast ${label}: ${(e as Error).message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`  ActualForecast total: ${total} rows`);
}

// ─── 3. AIES Generation Capacity (unit-level outage/capacity) ────────────────

async function seedGenCapacity(): Promise<void> {
  console.log("\n⚡ Seeding AIES gen capacity / outages (Jan 2024 → today)...");
  let total = 0;

  const existingRes = await db.execute(sql`
    SELECT EXTRACT(YEAR FROM date)::int AS y, EXTRACT(MONTH FROM date)::int AS m
    FROM aeso_generation_outage
    GROUP BY y, m LIMIT 200
  `);
  const existing = new Set<string>(
    existingRes.rows.map((r: Record<string, unknown>) => `${r["y"]}-${String(r["m"]).padStart(2, "0")}`)
  );

  for (const { startDate, endDate, label } of monthRange(2024, 1)) {
    if (existing.has(label)) {
      console.log(`  ✓ GenCapacity ${label} already seeded`);
      continue;
    }
    try {
      const data = await aFetch("aiesgencapacity-api/v1/AIESGenCapacity", { startDate, endDate }) as Record<string, unknown>;
      const rows = (data as Record<string, Record<string, unknown[]>>)?.return?.["AIES Gen Capacity Report"] ?? [];

      if (!Array.isArray(rows) || rows.length === 0) {
        console.log(`  ⚠️  GenCapacity ${label}: empty`);
        await sleep(DELAY_MS);
        continue;
      }

      // Batch in chunks of 500
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK) as Record<string, unknown>[];
        const values = chunk.map((r: Record<string, unknown>) => {
          const dt = parseAesoDatetime(String(r["begin_datetime_mpt"] ?? ""));
          const assetId = String(r["asset_ID"] ?? r["asset_id"] ?? "").replace(/'/g, "''");
          const assetName = String(r["asset_name"] ?? r["assetName"] ?? "").replace(/'/g, "''");
          const ppId = String(r["pool_participant_ID"] ?? r["pool_participant_id"] ?? "").replace(/'/g, "''");
          const fuelType = String(r["fuel_type"] ?? r["fuelType"] ?? "").replace(/'/g, "''");
          return `(
            '${dt.date}', ${dt.hourEnding},
            '${assetId}', '${assetName}', '${ppId}', '${fuelType}',
            ${safeFloat(r["max_capability_mw"] ?? r["maxCapabilityMw"]) ?? "NULL"},
            ${safeFloat(r["available_capability_mw"] ?? r["availableCapabilityMw"]) ?? "NULL"},
            ${safeFloat(r["approved_outage_mw"] ?? r["approvedOutageMw"]) ?? "NULL"},
            ${safeFloat(r["outage_mw"] ?? r["outageMw"]) ?? "NULL"},
            ${r["outage_type"] ? `'${String(r["outage_type"]).replace(/'/g, "''")}'` : "NULL"},
            ${r["outage_reason"] ? `'${String(r["outage_reason"]).replace(/'/g, "''")}'` : "NULL"}
          )`;
        }).join(",\n");

        await db.execute(sql.raw(`
          INSERT INTO aeso_generation_outage
            (date, hour_ending, asset_id, asset_name, pool_participant_id, fuel_type,
             max_capability_mw, available_capability_mw, approved_outage_mw,
             outage_mw, outage_type, outage_reason)
          VALUES ${values}
          ON CONFLICT (date, hour_ending, asset_id) DO UPDATE SET
            max_capability_mw       = EXCLUDED.max_capability_mw,
            available_capability_mw = EXCLUDED.available_capability_mw,
            approved_outage_mw      = EXCLUDED.approved_outage_mw,
            outage_mw               = EXCLUDED.outage_mw,
            outage_type             = EXCLUDED.outage_type
        `));
      }
      total += rows.length;
      console.log(`  ✓ GenCapacity ${label}: ${rows.length} rows`);
    } catch (e: unknown) {
      console.error(`  ❌ GenCapacity ${label}: ${(e as Error).message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`  GenCapacity total: ${total} rows`);
}

// ─── 4. Operating Reserve Offer Control (FFR, contingency) ──────────────────

async function seedOperatingReserve(): Promise<void> {
  console.log("\n🔋 Seeding operating reserve (FFR, contingency) (Jan 2024 → today)...");
  let total = 0;

  const existingRes = await db.execute(sql`
    SELECT EXTRACT(YEAR FROM date)::int AS y, EXTRACT(MONTH FROM date)::int AS m
    FROM aeso_operating_reserve
    GROUP BY y, m
  `);
  const existing = new Set<string>(
    existingRes.rows.map((r: Record<string, unknown>) => `${r["y"]}-${String(r["m"]).padStart(2, "0")}`)
  );

  for (const { startDate, endDate, label } of monthRange(2024, 1)) {
    if (existing.has(label)) {
      console.log(`  ✓ OpReserve ${label} already seeded`);
      continue;
    }
    try {
      const data = await aFetch("operatingreserveoffercontrol-api/v1/operatingReserveOfferControl", { startDate }) as Record<string, unknown>;
      // Response structure may vary — try common keys
      const raw = data as Record<string, unknown>;
      const ret = raw?.["return"] as Record<string, unknown> | undefined;
      const rows: Record<string, unknown>[] = [];

      // Flatten whatever the API returns into row objects
      if (ret) {
        for (const v of Object.values(ret)) {
          if (Array.isArray(v)) rows.push(...v as Record<string, unknown>[]);
        }
      }

      if (rows.length === 0) {
        console.log(`  ⚠️  OpReserve ${label}: empty`);
        await sleep(DELAY_MS);
        continue;
      }

      const values = rows.map((r: Record<string, unknown>) => {
        const dtStr = String(
          r["begin_datetime_mpt"] ?? r["datetime_mpt"] ?? r["date"] ?? ""
        );
        let dt: { date: string; hourEnding: number };
        try { dt = parseAesoDatetime(dtStr); }
        catch { return null; }

        return `(
          '${dt.date}', ${dt.hourEnding},
          ${safeFloat(r["contingency_reserve_required_mw"] ?? r["contingency_reserve"]) ?? "NULL"},
          ${safeFloat(r["spinning_reserve_mw"] ?? r["spinning_reserve"]) ?? "NULL"},
          ${safeFloat(r["supplemental_reserve_mw"] ?? r["supplemental_reserve"]) ?? "NULL"},
          ${safeFloat(r["ffr_mw"] ?? r["fast_frequency_response_mw"] ?? r["ffr"]) ?? "NULL"},
          ${safeFloat(r["reg_up_mw"] ?? r["regulation_up_mw"]) ?? "NULL"},
          ${safeFloat(r["reg_down_mw"] ?? r["regulation_down_mw"]) ?? "NULL"},
          ${safeFloat(r["total_operating_reserve_mw"] ?? r["total_reserve_mw"]) ?? "NULL"}
        )`;
      }).filter(Boolean).join(",\n");

      if (!values) {
        console.log(`  ⚠️  OpReserve ${label}: no parseable rows`);
        await sleep(DELAY_MS);
        continue;
      }

      await db.execute(sql.raw(`
        INSERT INTO aeso_operating_reserve
          (date, hour_ending, contingency_reserve_required_mw, spinning_reserve_mw,
           supplemental_reserve_mw, ffr_mw, reg_up_mw, reg_down_mw, total_operating_reserve_mw)
        VALUES ${values}
        ON CONFLICT (date, hour_ending) DO UPDATE SET
          contingency_reserve_required_mw = EXCLUDED.contingency_reserve_required_mw,
          spinning_reserve_mw             = EXCLUDED.spinning_reserve_mw,
          supplemental_reserve_mw         = EXCLUDED.supplemental_reserve_mw,
          ffr_mw                          = EXCLUDED.ffr_mw,
          reg_up_mw                       = EXCLUDED.reg_up_mw,
          reg_down_mw                     = EXCLUDED.reg_down_mw,
          total_operating_reserve_mw      = EXCLUDED.total_operating_reserve_mw
      `));
      total += rows.length;
      console.log(`  ✓ OpReserve ${label}: ${rows.length} rows`);
    } catch (e: unknown) {
      console.error(`  ❌ OpReserve ${label}: ${(e as Error).message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`  OpReserve total: ${total} rows`);
}

// ─── 5. Load Outage Forecast (last 90 days) ──────────────────────────────────
// NOTE: aeso_outages table stores generation facility outages (different schema).
// Load outage forecast data is stored in aeso_supply_demand.load_outage_mw column.

async function seedLoadOutage(): Promise<void> {
  console.log("\n🚧 Seeding load outage forecast (last 90 days)...");
  const today = new Date();
  const start = offsetDate(today, -90);

  try {
    const data = await aFetch("loadoutageforecast-api/v1/loadOutageReport", {
      startDate: start.toISOString().slice(0, 10),
      endDate: today.toISOString().slice(0, 10),
    }) as Record<string, unknown>;

    const ret = (data as Record<string, Record<string, unknown[]>>)?.return ?? {};
    const rows: Record<string, unknown>[] = [];
    for (const v of Object.values(ret)) {
      if (Array.isArray(v)) rows.push(...v as Record<string, unknown>[]);
    }

    if (rows.length === 0) {
      console.log("  ⚠️  Load outage: empty response");
      return;
    }

    // Store in aeso_supply_demand.load_outage_mw (add column if not exists)
    await db.execute(sql`
      ALTER TABLE aeso_supply_demand ADD COLUMN IF NOT EXISTS load_outage_mw numeric(10,2)
    `);

    const values = rows.map((r: Record<string, unknown>) => {
      const dtStr = String(r["begin_datetime_mpt"] ?? r["date"] ?? "");
      let dt: { date: string; hourEnding: number };
      try { dt = parseAesoDatetime(dtStr); }
      catch { return null; }
      const outage = safeFloat(r["load_outage_mw"] ?? r["outage_mw"] ?? r["forecast_load_outage_mw"]);
      return `('${dt.date}', ${dt.hourEnding}, ${outage ?? "NULL"})`;
    }).filter(Boolean).join(",\n");

    if (values) {
      await db.execute(sql.raw(`
        INSERT INTO aeso_supply_demand (date, hour_ending, load_outage_mw)
        VALUES ${values}
        ON CONFLICT (date, hour_ending) DO UPDATE SET
          load_outage_mw = EXCLUDED.load_outage_mw
      `));
      console.log(`  ✓ Load outage: ${rows.length} rows upserted into aeso_supply_demand`);
    }
  } catch (e: unknown) {
    console.error(`  ❌ Load outage: ${(e as Error).message}`);
  }
}

// ─── 6. Metered Volume — last 30 days, generator-level ──────────────────────

async function seedMeteredVolume(): Promise<void> {
  console.log("\n🏭 Seeding metered volumes (generator-level, last 30 days)...");
  const today = new Date();
  const start = offsetDate(today, -30);

  // Pull in 7-day chunks to avoid timeout
  const chunks: Array<{ s: string; e: string }> = [];
  let cur = new Date(start);
  while (cur < today) {
    const next = offsetDate(cur, 7);
    const e = next > today ? today : next;
    chunks.push({ s: cur.toISOString().slice(0, 10), e: e.toISOString().slice(0, 10) });
    cur = next;
  }

  let total = 0;
  for (const { s, e } of chunks) {
    try {
      const data = await aFetch("meteredvolume-api/v1/meteredvolume/details", {
        startDate: s, endDate: e,
      }) as Record<string, unknown>;

      const ret = (data as Record<string, Record<string, unknown[]>>)?.return ?? {};
      const rows: Record<string, unknown>[] = [];
      for (const v of Object.values(ret)) {
        if (Array.isArray(v)) rows.push(...v as Record<string, unknown>[]);
      }

      if (rows.length === 0) {
        console.log(`  ⚠️  MeteredVol ${s}→${e}: empty`);
        await sleep(DELAY_MS);
        continue;
      }

      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK) as Record<string, unknown>[];
        const values = chunk.map((r: Record<string, unknown>) => {
          const dtStr = String(r["begin_datetime_mpt"] ?? r["datetime_mpt"] ?? "");
          let dt: { date: string; hourEnding: number };
          try { dt = parseAesoDatetime(dtStr); }
          catch { return null; }
          const assetId = String(r["asset_ID"] ?? r["asset_id"] ?? "").replace(/'/g, "''");
          const assetName = String(r["asset_name"] ?? "").replace(/'/g, "''");
          const ppId = String(r["pool_participant_ID"] ?? r["pool_participant_id"] ?? "").replace(/'/g, "''");
          const fuelType = String(r["fuel_type"] ?? r["fuelType"] ?? "").replace(/'/g, "''");
          return `(
            '${dt.date}', ${dt.hourEnding},
            '${assetId}', '${assetName}', '${ppId}', '${fuelType}',
            ${safeFloat(r["metered_volume_mw"] ?? r["metered_mw"] ?? r["metered_volume"]) ?? "NULL"}
          )`;
        }).filter(Boolean).join(",\n");

        if (values) {
          await db.execute(sql.raw(`
            INSERT INTO aeso_metered_volume
              (date, hour_ending, asset_id, asset_name, pool_participant_id, fuel_type, metered_mw)
            VALUES ${values}
            ON CONFLICT (date, hour_ending, asset_id) DO UPDATE SET
              metered_mw = EXCLUDED.metered_mw
          `));
        }
      }
      total += rows.length;
      console.log(`  ✓ MeteredVol ${s}→${e}: ${rows.length} rows`);
    } catch (e2: unknown) {
      console.error(`  ❌ MeteredVol ${s}→${e}: ${(e2 as Error).message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`  MeteredVol total: ${total} rows`);
}

// ─── 7. Asset List (one-time registry) ──────────────────────────────────────

async function seedAssetList(): Promise<void> {
  console.log("\n🏗️  Seeding asset registry...");

  // Check if already seeded
  const existing = await db.execute(sql`SELECT COUNT(*) as cnt FROM aeso_asset_registry`);
  const cnt = parseInt(String(existing.rows[0]?.["cnt"] ?? "0"), 10);
  if (cnt > 100) {
    console.log(`  ✓ Asset registry already has ${cnt} records — skipping`);
    return;
  }

  try {
    const data = await aFetch("assetlist-api/v1/assetlist") as Record<string, unknown>;
    const ret = (data as Record<string, Record<string, unknown[]>>)?.return ?? {};
    const rows: Record<string, unknown>[] = [];
    for (const v of Object.values(ret)) {
      if (Array.isArray(v)) rows.push(...v as Record<string, unknown>[]);
    }

    if (rows.length === 0) {
      console.log("  ⚠️  Asset list: empty response");
      return;
    }

    const CHUNK = 200;
    let total = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK) as Record<string, unknown>[];
      const values = chunk.map((r: Record<string, unknown>) => {
        const assetId = String(r["asset_ID"] ?? r["asset_id"] ?? "").replace(/'/g, "''");
        const assetName = String(r["asset_name"] ?? r["assetName"] ?? "").replace(/'/g, "''");
        const ppId = String(r["pool_participant_ID"] ?? r["pool_participant_id"] ?? "").replace(/'/g, "''");
        const ppName = String(r["pool_participant_name"] ?? "").replace(/'/g, "''");
        const fuelType = String(r["fuel_type"] ?? r["fuelType"] ?? "").replace(/'/g, "''");
        const subFuel = String(r["sub_fuel_type"] ?? r["subFuelType"] ?? "").replace(/'/g, "''");
        const location = String(r["location"] ?? r["region"] ?? "").replace(/'/g, "''");
        const status = String(r["operating_status"] ?? r["status"] ?? "active").replace(/'/g, "''");
        return `(
          '${assetId}', '${assetName}', '${ppId}', '${ppName}',
          '${fuelType}', '${subFuel}',
          ${safeFloat(r["max_capability_mw"] ?? r["maxCapabilityMw"]) ?? "NULL"},
          '${location}', '${status}'
        )`;
      }).join(",\n");

      if (values) {
        await db.execute(sql.raw(`
          INSERT INTO aeso_asset_registry
            (asset_id, asset_name, pool_participant_id, pool_participant_name,
             fuel_type, sub_fuel_type, max_capability_mw, location, status)
          VALUES ${values}
          ON CONFLICT (asset_id) DO UPDATE SET
            asset_name            = EXCLUDED.asset_name,
            max_capability_mw     = EXCLUDED.max_capability_mw,
            status                = EXCLUDED.status
        `));
        total += chunk.length;
      }
    }
    console.log(`  ✓ Asset registry: ${total} assets`);
  } catch (e: unknown) {
    console.error(`  ❌ Asset registry: ${(e as Error).message}`);
  }
}

// ─── 8. Pool Participants (one-time registry) ─────────────────────────────────

async function seedPoolParticipants(): Promise<void> {
  console.log("\n🏢 Seeding pool participants...");

  const existing = await db.execute(sql`SELECT COUNT(*) as cnt FROM aeso_pool_participants`);
  const cnt = parseInt(String(existing.rows[0]?.["cnt"] ?? "0"), 10);
  if (cnt > 50) {
    console.log(`  ✓ Pool participants already has ${cnt} records — skipping`);
    return;
  }

  try {
    const data = await aFetch("PoolParticipant-api/v1/poolparticipantlist") as Record<string, unknown>;
    const ret = (data as Record<string, Record<string, unknown[]>>)?.return ?? {};
    const rows: Record<string, unknown>[] = [];
    for (const v of Object.values(ret)) {
      if (Array.isArray(v)) rows.push(...v as Record<string, unknown>[]);
    }

    if (rows.length === 0) {
      console.log("  ⚠️  Pool participants: empty response");
      return;
    }

    const values = rows.map((r: Record<string, unknown>) => {
      const id = String(r["pool_participant_ID"] ?? r["pool_participant_id"] ?? "").replace(/'/g, "''");
      const name = String(r["pool_participant_name"] ?? r["name"] ?? "").replace(/'/g, "''");
      const type = String(r["pool_participant_type"] ?? r["type"] ?? "").replace(/'/g, "''");
      const status = String(r["status"] ?? "active").replace(/'/g, "''");
      return `('${id}', '${name}', '${type}', '${status}')`;
    }).join(",\n");

    if (values) {
      await db.execute(sql.raw(`
        INSERT INTO aeso_pool_participants (participant_id, participant_name, participant_type, status)
        VALUES ${values}
        ON CONFLICT (participant_id) DO UPDATE SET
          participant_name = EXCLUDED.participant_name,
          status           = EXCLUDED.status
      `));
      console.log(`  ✓ Pool participants: ${rows.length} records`);
    }
  } catch (e: unknown) {
    console.error(`  ❌ Pool participants: ${(e as Error).message}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("🍁 AESO Real Data Seeder");
  console.log("   Base URL:", BASE);
  console.log("   API key:", API_KEY.slice(0, 8) + "...");
  console.log("   Date range: Jan 2024 → today");
  console.log("");

  // Run in sequence (rate-limit friendly)
  await seedPoolPrice();
  await seedActualForecast();
  await seedGenCapacity();
  await seedOperatingReserve();
  await seedLoadOutage();
  await seedMeteredVolume();
  await seedAssetList();
  await seedPoolParticipants();

  console.log("\n✅ AESO real data seeding complete!");
  process.exit(0);
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
