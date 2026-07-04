/**
 * Seed daily gas prices: Henry Hub (FRED) + Waha (EIA v2, if key has gas access).
 *
 * Network note: Node.js https.get is blocked in this env — we shell out to curl.
 * Henry Hub: FRED DHHNGSP — free, no auth, daily since 1997.
 * Waha:      EIA v2 natural-gas — requires EIA_API_KEY with natural gas scope.
 *
 * Run: pnpm --filter @workspace/scripts run seed-gas-prices
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { execSync } from "child_process";
import { parse } from "csv-parse/sync";

// ── helpers ────────────────────────────────────────────────────────────────

function curlGet(url: string, timeoutSec = 30): string {
  return execSync(
    `curl -s --max-time ${timeoutSec} --compressed -L "${url}"`,
    { maxBuffer: 50 * 1024 * 1024 }
  ).toString("utf8");
}

async function upsertRows(rows: { hub: string; date: string; price: number }[]) {
  if (!rows.length) return 0;
  const PAGE = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += PAGE) {
    const chunk = rows.slice(i, i + PAGE);
    await db.execute(sql`
      INSERT INTO gas_prices (hub, date, price, source)
      VALUES ${sql.raw(
        chunk.map(r =>
          `('${r.hub}', '${r.date}', ${r.price.toFixed(4)}, 'fred')`
        ).join(", ")
      )}
      ON CONFLICT (hub, date) DO UPDATE SET
        price  = EXCLUDED.price,
        source = EXCLUDED.source
    `);
    total += chunk.length;
    process.stdout.write(`\r  upserted ${total}/${rows.length}`);
  }
  console.log();
  return total;
}

// ── Henry Hub from FRED ────────────────────────────────────────────────────

async function seedHenryHub() {
  console.log("Fetching Henry Hub daily from FRED (DHHNGSP)…");
  const csv = curlGet("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DHHNGSP");
  const records = parse(csv, { columns: true, skip_empty_lines: true }) as Array<{
    observation_date: string;
    DHHNGSP: string;
  }>;

  const rows = records.filter(r => {
    const d = new Date(r.observation_date);
    return d >= new Date("2024-01-01") && r.DHHNGSP !== "." && !isNaN(Number(r.DHHNGSP));
  }).map(r => ({
    hub:   "henry_hub",
    date:  r.observation_date,
    price: Number(r.DHHNGSP),
  }));

  console.log(`  Parsed ${rows.length} Henry Hub rows (2024-01-01 → latest)`);
  return upsertRows(rows);
}

// ── Waha Hub from EIA v2 (requires nat-gas API key scope) ─────────────────

async function seedWaha() {
  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    console.warn("  EIA_API_KEY not set — skipping Waha.");
    return 0;
  }

  // Check if the key has natural gas access by probing the facet endpoint
  let hasAccess = false;
  try {
    const probe = curlGet(
      `https://api.eia.gov/v2/natural-gas/pri/sum/facet/duoarea/?api_key=${apiKey}`,
      10
    );
    const parsed = JSON.parse(probe);
    const areas: unknown[] = parsed?.response?.duoarea ?? [];
    hasAccess = areas.length > 0;
    if (!hasAccess) {
      console.warn("  EIA key does not have natural-gas price scope. Waha skipped.");
      console.warn("  To enable Waha: set AESO_API_KEY (unused) or get an EIA nat-gas key.");
      return 0;
    }
    console.log(`  EIA nat-gas access confirmed. ${areas.length} duoareas available.`);
  } catch {
    console.warn("  EIA nat-gas probe failed. Waha skipped.");
    return 0;
  }

  // Find Waha duoarea code
  const probe2 = curlGet(
    `https://api.eia.gov/v2/natural-gas/pri/sum/facet/duoarea/?api_key=${apiKey}`,
    10
  );
  const p2 = JSON.parse(probe2);
  const areas: Array<{ id: string; name: string }> = p2?.response?.duoarea ?? [];
  const waha = areas.find(a =>
    a.name?.toLowerCase().includes("waha") ||
    a.name?.toLowerCase().includes("west texas")
  ) ?? { id: "Y35NY", name: "Waha" };

  console.log(`  Waha duoarea: ${waha.id} — ${waha.name}`);

  const rows: { hub: string; date: string; price: number }[] = [];

  // Fetch weekly Waha prices in yearly chunks to stay under API limits
  for (const [start, end] of [["2024-01-01","2024-12-31"],["2025-01-01","2025-12-31"],["2026-01-01","2026-12-31"]]) {
    try {
      const body = curlGet(
        `https://api.eia.gov/v2/natural-gas/pri/sum/data/?api_key=${apiKey}` +
        `&frequency=weekly&data[0]=value&facets[duoarea][]=${waha.id}` +
        `&start=${start}&end=${end}&sort[0][column]=period&sort[0][direction]=asc&length=200`,
        15
      );
      const parsed = JSON.parse(body);
      const data: Array<{ period: string; value: string | number }> = parsed?.response?.data ?? [];
      console.log(`  ${start.slice(0,4)}: ${data.length} Waha weekly rows`);
      for (const r of data) {
        const val = Number(r.value);
        if (isNaN(val) || !r.period) continue;
        rows.push({ hub: "waha", date: r.period, price: val });
      }
    } catch (e) {
      console.warn(`  Waha ${start.slice(0,4)} fetch failed:`, (e as Error).message);
    }
  }

  if (rows.length === 0) return 0;

  // Overwrite source for Waha rows
  const PAGE = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += PAGE) {
    const chunk = rows.slice(i, i + PAGE);
    await db.execute(sql`
      INSERT INTO gas_prices (hub, date, price, source)
      VALUES ${sql.raw(chunk.map(r =>
        `('${r.hub}', '${r.date}', ${r.price.toFixed(4)}, 'eia')`
      ).join(", "))}
      ON CONFLICT (hub, date) DO UPDATE SET
        price  = EXCLUDED.price,
        source = EXCLUDED.source
    `);
    total += chunk.length;
    process.stdout.write(`\r  upserted ${total}/${rows.length}`);
  }
  console.log();
  return total;
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Gas Price Seeder ===\n");

  const hhRows = await seedHenryHub();
  console.log(`Henry Hub: ${hhRows} rows upserted\n`);

  const wahaRows = await seedWaha();
  console.log(`Waha: ${wahaRows} rows upserted\n`);

  const counts = await db.execute<{ hub: string; cnt: string; min_date: string; max_date: string }>(
    sql`SELECT hub, COUNT(*)::text AS cnt, MIN(date)::text AS min_date, MAX(date)::text AS max_date
        FROM gas_prices GROUP BY hub ORDER BY hub`
  );
  console.log("Final DB counts:");
  for (const r of counts.rows) {
    console.log(`  ${r.hub}: ${r.cnt} rows  (${r.min_date} → ${r.max_date})`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
