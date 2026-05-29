/**
 * score-ercot-curtailment.ts
 *
 * Updates curtailment_score for all ERCOT candidates using real data:
 *   1. Maps each candidate to an ERCOT load zone by lat/lon bounding box
 *   2. Uses real DA-RT spread per load zone from ercot_node_stats (2024-2026)
 *   3. Applies asset-type curtailment penalties (wind/solar > gas/nuclear)
 *   4. Blends with CDR 12301 resource node neg_price_percent (fleet avg 6.42%)
 *   5. Updates candidates.curtailment_score (0-100) and pricing_hub_node
 *
 * Score interpretation: 100 = no curtailment risk, 0 = severe curtailment exposure
 * Wind/solar in LZ_WEST (west Texas) score lowest; gas/nuclear in LZ_HOUSTON score highest.
 */

import { db, ercotNodeStatsTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";

// ── Load zone lat/lon bounding boxes ──────────────────────────────────────────
// Based on ERCOT service territory geography (approximate)
// Reference: https://www.ercot.com/services/programs/network/loadzone
function mapToErcotZone(lat: number, lon: number): string {
  // Panhandle and West Texas (wind corridor, most constrained for renewables)
  if (lon < -99.5) return "LZ_WEST";
  // Far West Texas shoulder — also tends to be western zone
  if (lon < -98.5 && lat > 30.5) return "LZ_WEST";
  // North Central Texas (DFW corridor)
  if (lat >= 31.5 && lon >= -98.5 && lon < -96.0) return "LZ_NORTH";
  // Houston metro and East Texas
  if (lon >= -96.0) return "LZ_HOUSTON";
  // Central Texas north of 31 (some AEN/CPS territory — treat as North)
  if (lat >= 31.0 && lon >= -98.5 && lon < -96.0) return "LZ_NORTH";
  // South Texas / Corpus / Laredo / Rio Grande Valley
  if (lat < 29.5) return "LZ_SOUTH";
  // Everything remaining: Central Texas (Austin / San Antonio corridor)
  return "LZ_SOUTH";
}

// ── Zone-level base curtailment penalty (real data-informed) ──────────────────
// Source: ERCOT CREZ transmission studies + CDR 12301 neg_price patterns
// West Texas / Panhandle: historically 15-30% neg-price hours for wind nodes
// South Texas / Gulf: 10-20% for solar, less for wind
// Houston: relatively low, good load density absorbs generation
// North: moderate
const ZONE_BASE_PENALTY: Record<string, number> = {
  LZ_WEST:    28,   // Highest curtailment — constrained transmission out of West TX
  LZ_NORTH:   14,   // Moderate — good load center access (DFW)
  LZ_SOUTH:   18,   // High solar curtailment in south TX; moderate wind
  LZ_HOUSTON: 8,    // Best — load-dense, absorbs generation well
  LZ_AEN:     20,   // CPS / Alamo area — growing solar saturation
  LZ_CPS:     20,   // Same
  LZ_LCRA:    22,   // Central TX, moderate congestion
  LZ_RAYBN:   12,   // East Texas, decent
};

// ── Asset-type multipliers ─────────────────────────────────────────────────────
// Thermal / dispatchable assets face far less curtailment than variable renewables
// Wind in LZ_WEST is the worst case; solar gets daytime curtailment penalty
const ASSET_MULTIPLIER: Record<string, Record<string, number>> = {
  wind:        { LZ_WEST:1.35, LZ_NORTH:1.2,  LZ_SOUTH:1.15, LZ_HOUSTON:1.0,  default:1.2  },
  solar:       { LZ_WEST:1.25, LZ_NORTH:1.1,  LZ_SOUTH:1.3,  LZ_HOUSTON:1.05, default:1.15 },
  solar_storage:{ LZ_WEST:1.15, LZ_NORTH:1.05, LZ_SOUTH:1.2,  LZ_HOUSTON:1.0,  default:1.1  },
  wind_storage:{ LZ_WEST:1.2,  LZ_NORTH:1.1,  LZ_SOUTH:1.1,  LZ_HOUSTON:0.95, default:1.1  },
  storage:     { LZ_WEST:0.8,  LZ_NORTH:0.75, LZ_SOUTH:0.8,  LZ_HOUSTON:0.7,  default:0.75 },
  natural_gas: { LZ_WEST:0.5,  LZ_NORTH:0.45, LZ_SOUTH:0.5,  LZ_HOUSTON:0.4,  default:0.45 },
  nuclear:     { LZ_WEST:0.4,  LZ_NORTH:0.35, LZ_SOUTH:0.4,  LZ_HOUSTON:0.35, default:0.38 },
  hydro:       { LZ_WEST:0.6,  LZ_NORTH:0.55, LZ_SOUTH:0.6,  LZ_HOUSTON:0.5,  default:0.55 },
  biomass:     { LZ_WEST:0.55, LZ_NORTH:0.5,  LZ_SOUTH:0.55, LZ_HOUSTON:0.45, default:0.5  },
};

function getAssetMultiplier(assetType: string, zone: string): number {
  const m = ASSET_MULTIPLIER[assetType];
  if (!m) return 1.0;
  return m[zone] ?? m["default"] ?? 1.0;
}

// ── Score formula ─────────────────────────────────────────────────────────────
// base_penalty = ZONE_BASE_PENALTY * asset_multiplier
// rt_adjustment = zone real DA-RT spread bonus (negative spread = RT > DA = good for generator)
// neg_pct_adjustment = fleet-level neg_price_percent penalty (CDR 12301, fleet avg 6.42%)
// curtailment_score = clamp(100 - adjusted_penalty, 5, 98)
function computeScore(
  zone: string,
  assetType: string,
  zoneSpread: number,          // avg(DA - RT) — negative in ERCOT means RT > DA (good)
  fleetNegPct: number,         // avg fleet neg_price_percent (6.42%)
): number {
  const basePenalty = ZONE_BASE_PENALTY[zone] ?? 20;
  const mult = getAssetMultiplier(assetType, zone);
  const adjustedPenalty = basePenalty * mult;

  // DA-RT adjustment: more negative spread (RT >> DA) = better market for generator → small bonus
  // More positive spread (DA > RT) = curtailment signal → penalty
  // In ERCOT all spreads are slightly negative in 2024-26, so this is a small range
  const spreadBonus = Math.min(8, Math.max(-8, -zoneSpread * 2)); // spread is negative, so bonus is positive

  // Fleet neg_price adjustment: 6.42% fleet average = reference point
  // Each % above 6.42% fleet avg is a penalty; below is a bonus
  // For variable renewables (wind/solar), they are more exposed to neg prices
  const negPctPenalty = (fleetNegPct - 6.42) * 0.5; // small adjustment since we use fleet avg

  const rawScore = 100 - adjustedPenalty + spreadBonus - negPctPenalty;
  return Math.round(Math.min(98, Math.max(5, rawScore)) * 100) / 100;
}

async function main() {
  console.log("🔍 Fetching zone-level DA-RT spread data (2024-2026)...");

  // Fetch real DA-RT spreads per load zone (2024 onward = real data from CDR 13060/13061)
  const zoneStats = await db.execute<{ node: string; avg_spread: number }>(sql`
    SELECT node,
           AVG(avg_da_price::numeric - avg_rt_price::numeric) AS avg_spread
    FROM ercot_node_stats
    WHERE node_type = 'load_zone'
      AND avg_rt_price IS NOT NULL
      AND year >= 2024
    GROUP BY node
  `);

  const zoneSpreadMap: Record<string, number> = {};
  for (const row of zoneStats.rows) {
    zoneSpreadMap[row.node] = Number(row.avg_spread);
  }
  console.log("   Zone spreads (DA - RT):", zoneSpreadMap);

  // Fetch fleet avg neg_price_percent from CDR 12301 resource nodes
  const negPctResult = await db.execute<{ avg_neg_pct: number }>(sql`
    SELECT AVG(neg_price_percent::numeric) AS avg_neg_pct
    FROM ercot_node_stats
    WHERE node_type = 'resource_node' AND neg_price_percent IS NOT NULL
  `);
  const fleetNegPct = Number(negPctResult.rows[0]?.avg_neg_pct ?? 6.42);
  console.log(`   Fleet avg neg-price % (CDR 12301): ${fleetNegPct.toFixed(2)}%`);

  // Fetch all ERCOT candidates
  const candidates = await db.execute<{
    id: number; name: string; asset_type: string;
    latitude: number; longitude: number; curtailment_score: number | null;
  }>(sql`
    SELECT id, name, asset_type, latitude::float, longitude::float, curtailment_score
    FROM candidates WHERE market = 'ERCOT'
    ORDER BY id
  `);

  console.log(`\n📊 Scoring ${candidates.rows.length} ERCOT candidates...`);

  const updates: { id: number; curtailmentScore: string; zone: string; score: number }[] = [];

  for (const c of candidates.rows) {
    const zone = mapToErcotZone(Number(c.latitude), Number(c.longitude));
    const spread = zoneSpreadMap[zone] ?? -1.0; // default: slight negative spread (normal for ERCOT)
    const score = computeScore(zone, c.asset_type, spread, fleetNegPct);
    updates.push({ id: c.id, curtailmentScore: score.toFixed(2), zone, score });
  }

  // Stats preview
  const byZone: Record<string, number[]> = {};
  const byType: Record<string, number[]> = {};
  for (const u of updates) {
    (byZone[u.zone] ??= []).push(u.score);
    const c = candidates.rows.find(r => r.id === u.id)!;
    (byType[c.asset_type] ??= []).push(u.score);
  }

  console.log("\n   Scores by zone (avg):");
  for (const [zone, scores] of Object.entries(byZone).sort()) {
    console.log(`     ${zone}: avg ${(scores.reduce((s,v)=>s+v,0)/scores.length).toFixed(1)}, min ${Math.min(...scores).toFixed(1)}, max ${Math.max(...scores).toFixed(1)} (${scores.length} candidates)`);
  }
  console.log("\n   Scores by asset type (avg):");
  for (const [type, scores] of Object.entries(byType).sort()) {
    console.log(`     ${type}: avg ${(scores.reduce((s,v)=>s+v,0)/scores.length).toFixed(1)} (${scores.length} candidates)`);
  }

  // Batch update in chunks of 100
  console.log("\n💾 Writing updated curtailment_score + pricing_hub_node to DB...");
  const CHUNK = 100;
  let updated = 0;

  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    await Promise.all(chunk.map(u =>
      db.execute(sql`
        UPDATE candidates
        SET curtailment_score = ${u.curtailmentScore}::numeric,
            pricing_hub_node = ${u.zone},
            updated_at = NOW()
        WHERE id = ${u.id}
      `)
    ));
    updated += chunk.length;
    process.stdout.write(`\r   ${updated}/${updates.length} updated...`);
  }

  console.log(`\n\n✅ Done — scored ${updated} ERCOT candidates.`);
  console.log("   curtailment_score now reflects:");
  console.log("     • ERCOT load zone assignment by lat/lon (LZ_WEST/NORTH/SOUTH/HOUSTON)");
  console.log("     • Zone DA-RT spread from real CDR data (2024-2026)");
  console.log("     • Asset-type curtailment exposure (wind/solar > gas/nuclear)");
  console.log(`     • Fleet neg-price % baseline: ${fleetNegPct.toFixed(2)}% (CDR 12301, Apr-May 2026)`);
  console.log("   pricing_hub_node now records the mapped ERCOT load zone.");

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
