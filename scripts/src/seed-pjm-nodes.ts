/**
 * Seed PJM resource nodes into pjm_node_stats
 * Also seeds the zone/hub reference nodes if missing.
 * Generates real-pattern data for 2022-2025.
 */
import { db, pjmNodeStatsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

// ── Zone/Hub reference nodes (used for ZoneCompare) ──────────────────────────
const ZONE_NODES = [
  "Western Hub", "Eastern Hub", "AEP-Dayton Hub", "NI Hub",
  "PSEG", "PPL", "DOM", "BGE", "PECO", "COMED", "ATSI", "PENELEC",
];

// Western Hub monthly base ($/MWh) per year — calibrated to published data
const WH_BASE: Record<number, number[]> = {
  2022: [88.4, 95.2, 70.8, 45.6, 52.3, 62.5, 71.8, 67.2, 54.4, 47.2, 61.8, 98.5],
  2023: [51.2, 43.5, 36.8, 29.4, 31.8, 35.5, 44.2, 41.0, 31.5, 27.8, 29.9, 39.4],
  2024: [53.8, 46.2, 37.4, 27.6, 31.2, 37.8, 47.5, 44.8, 34.2, 29.5, 37.6, 48.1],
  2025: [56.2, 49.4, 41.0, 32.8, 36.0, 43.5, 53.2, 49.6, 38.5, 32.4, 41.2, 53.8],
};

// Zone offset from Western Hub ($/MWh DA)
const ZONE_OFFSET: Record<string, number> = {
  "Western Hub":    0,
  "Eastern Hub":    3.5,
  "AEP-Dayton Hub": -2.5,
  "NI Hub":         -1.8,
  "PSEG":            6.2,
  "PPL":             2.0,
  "DOM":            -3.5,
  "BGE":             4.5,
  "PECO":            3.8,
  "COMED":          -1.5,
  "ATSI":           -1.2,
  "PENELEC":         1.5,
};

// ── Resource node definitions ─────────────────────────────────────────────────
// [prefix, units, region]
// region drives price: basis vs reference WH price, RT spread, neg%

type NodeDef = [prefix: string, units: number, region: string];

// ── WIND (Appalachian/Midwest) ────────────────────────────────────────────────
const WIND_WV: NodeDef[] = [
  ["MOUNTAINEER_WIND",   6, "wind_wv"],
  ["BEECH_RIDGE_WIND",   5, "wind_wv"],
  ["MOUNT_STORM_WIND",   6, "wind_wv"],
  ["PINNACLE_WIND",      3, "wind_wv"],
  ["NORTH_FORK_WIND",    4, "wind_wv"],
  ["TUG_HILL_WIND",      4, "wind_wv"],
  ["LAUREL_MTN_WIND",    5, "wind_wv"],
];

const WIND_PA: NodeDef[] = [
  ["LAUREL_HILL_WIND",   5, "wind_pa"],
  ["CASSELMAN_WIND",     4, "wind_pa"],
  ["BEAR_CREEK_WIND",    4, "wind_pa"],
  ["ELK_RUN_WIND",       4, "wind_pa"],
  ["HIGHLAND_WIND_PA",   5, "wind_pa"],
  ["GAMESA_BALD_EAGLE",  4, "wind_pa"],
  ["SEVEN_RIDGES_WIND",  4, "wind_pa"],
  ["SHAFFER_MTN_WIND",   4, "wind_pa"],
  ["RAGER_MTN_WIND",     4, "wind_pa"],
  ["SHAWNEE_WIND",       3, "wind_pa"],
];

const WIND_MD_OH_IN: NodeDef[] = [
  ["CRITERION_WIND_MD",  3, "wind_md"],
  ["ROCKY_GAP_WIND",     3, "wind_md"],
  ["FOWLER_RIDGE_WIND",  6, "wind_in"],
  ["MEADOW_LAKE_WIND",   8, "wind_in"],
  ["HARDSCRABBLE_WIND",  4, "wind_in"],
  ["TIMBER_ROAD_WIND",   4, "wind_oh"],
  ["RAILSPLITTER_WIND",  5, "wind_il"],
  ["TWIN_GROVES_WIND",   6, "wind_il"],
  ["ROLLING_MEADOWS",    5, "wind_il"],
];

// ── SOLAR (VA, MD, NJ, PA, OH) ────────────────────────────────────────────────
const SOLAR_VA: NodeDef[] = [
  ["DOMINION_SCOTT_SOL", 3, "solar_va"],
  ["DOMINION_PORTSMOUTH",3, "solar_va"],
  ["REMINGTON_SOLAR",    4, "solar_va"],
  ["SPOTSYLVANIA_SOLAR", 4, "solar_va"],
  ["ISLE_OF_WIGHT_SOL",  3, "solar_va"],
  ["LOUDOUN_SOLAR",      4, "solar_va"],
  ["PITTSYLVANIA_SOLAR", 3, "solar_va"],
  ["SOUTH_RIDING_SOLAR", 3, "solar_va"],
  ["QUANTICO_SOLAR",     3, "solar_va"],
];

const SOLAR_MD_NJ_PA: NodeDef[] = [
  ["SOLAR_GARRETT_MD",   3, "solar_md"],
  ["PINEY_ORCHARD_SOL",  3, "solar_md"],
  ["BOARDWALK_SOLAR_NJ", 3, "solar_nj"],
  ["VINELAND_SOLAR_NJ",  3, "solar_nj"],
  ["ATLANTIC_SOLAR_NJ",  4, "solar_nj"],
  ["BETHLEHEM_SOLAR_PA", 3, "solar_pa"],
  ["BUCKS_COUNTY_SOLAR", 3, "solar_pa"],
  ["SOLARGIN_OHIO",      4, "solar_oh"],
  ["BUCKEYE_SOLAR_OH",   4, "solar_oh"],
  ["RICHLAND_SOLAR_OH",  4, "solar_oh"],
];

// ── NUCLEAR ───────────────────────────────────────────────────────────────────
const NUCLEAR: NodeDef[] = [
  ["LIMERICK_NUC",       2, "nuclear_pa"],     // PA (Exelon)
  ["PEACH_BOTTOM_NUC",   2, "nuclear_pa"],     // PA (Exelon)
  ["SUSQUEHANNA_NUC",    2, "nuclear_pa"],     // PA (PPL)
  ["THREE_MILE_ISLAND",  1, "nuclear_pa"],     // PA (Exelon, restarted 2024)
  ["SALEM_NUC",          2, "nuclear_nj"],     // NJ (PSEG)
  ["HOPE_CREEK_NUC",     1, "nuclear_nj"],     // NJ (PSEG)
  ["CALVERT_CLIFFS_NUC", 2, "nuclear_md"],     // MD (Constellation)
  ["BYRON_NUC",          2, "nuclear_il"],     // IL (Exelon)
  ["BRAIDWOOD_NUC",      2, "nuclear_il"],     // IL (Exelon)
  ["QUAD_CITIES_NUC",    2, "nuclear_il"],     // IL (Exelon)
  ["DAVIS_BESSE_NUC",    1, "nuclear_oh"],     // OH (EnergyHarbor)
  ["PERRY_NUC",          1, "nuclear_oh"],     // OH (EnergyHarbor)
];

// ── GAS ───────────────────────────────────────────────────────────────────────
const GAS_PA: NodeDef[] = [
  ["HOMER_CITY_GAS",     4, "gas_pa"],
  ["BRUNNER_ISLAND_GAS", 3, "gas_pa"],
  ["MONTOUR_GAS",        2, "gas_pa"],
  ["BETHLEHEM_GAS_PA",   3, "gas_pa"],
  ["EASTON_GAS_PA",      2, "gas_pa"],
  ["KEYSTONE_GAS",       2, "gas_pa"],
  ["CONEMAUGH_GAS",      2, "gas_pa"],
];

const GAS_NJ_MD: NodeDef[] = [
  ["BERGEN_GAS_NJ",      3, "gas_nj"],
  ["LINDEN_COGEN_NJ",    3, "gas_nj"],
  ["NEWARK_GAS_NJ",      2, "gas_nj"],
  ["KEARNY_GAS_NJ",      2, "gas_nj"],
  ["BAYONNE_GAS_NJ",     2, "gas_nj"],
  ["BRANDON_SHORES_MD",  3, "gas_md"],
  ["CAYUGA_GAS_MD",      2, "gas_md"],
  ["CHALK_POINT_GAS",    3, "gas_md"],
];

const GAS_VA_OH: NodeDef[] = [
  ["CHESTERFIELD_GAS",   3, "gas_va"],
  ["POSSUM_POINT_GAS",   3, "gas_va"],
  ["YORKTOWN_GAS_VA",    3, "gas_va"],
  ["AES_BEAVER_VALLEY",  3, "gas_oh"],
  ["CARDINAL_GAS_OH",    2, "gas_oh"],
  ["AEP_AMOS_GAS",       3, "gas_wv"],
  ["PLEASANTS_GAS_WV",   2, "gas_wv"],
  ["HARRISON_GAS_WV",    3, "gas_wv"],
];

// ── COAL (declining but still significant in PJM) ─────────────────────────────
const COAL: NodeDef[] = [
  ["HOMER_CITY_COAL",    3, "coal_pa"],
  ["SHAWVILLE_COAL",     2, "coal_pa"],
  ["HATFIELD_COAL",      2, "coal_pa"],
  ["AEP_AMOS_COAL",      3, "coal_wv"],
  ["AEP_MOUNTAINEER_COA",2, "coal_wv"],
  ["HARRISON_COAL",      3, "coal_wv"],
  ["PLEASANTS_COAL",     2, "coal_wv"],
  ["SAMMIS_COAL",        3, "coal_oh"],
  ["CARDINAL_COAL",      2, "coal_oh"],
  ["WILL_COUNTY_COAL",   2, "coal_il"],
];

// ── Price model ───────────────────────────────────────────────────────────────
// basis = node DA vs Western Hub DA ($/MWh)
const BASIS: Record<string, number> = {
  wind_wv:    -3.5,  wind_pa:    -2.8,  wind_md:   -2.0,
  wind_in:    -4.0,  wind_oh:    -3.0,  wind_il:   -3.2,
  solar_va:   -5.0,  solar_md:   -4.5,  solar_nj:  -3.8,
  solar_pa:   -4.0,  solar_oh:   -5.5,
  nuclear_pa: +0.8,  nuclear_nj: +6.0,  nuclear_md: +3.5,
  nuclear_il: -1.8,  nuclear_oh: -1.5,
  gas_pa:     +3.2,  gas_nj:     +7.5,  gas_md:    +4.8,
  gas_va:     -2.0,  gas_oh:     -2.5,  gas_wv:    -4.0,
  coal_pa:    -1.5,  coal_wv:    -5.0,  coal_oh:   -3.5,  coal_il: -4.5,
};

// RT vs DA spread: negative = RT lower than DA
const RT_BASIS: Record<string, number> = {
  wind_wv:   -2.0,  wind_pa:   -1.5,  wind_md:   -1.2,
  wind_in:   -2.5,  wind_oh:   -2.0,  wind_il:   -2.2,
  solar_va:  -8.0,  solar_md:  -7.0,  solar_nj:  -5.5,
  solar_pa:  -6.0,  solar_oh:  -7.5,
  nuclear_pa: 0.5,  nuclear_nj: 1.2,  nuclear_md: 0.8,
  nuclear_il: 0.3,  nuclear_oh: 0.4,
  gas_pa:    +4.5,  gas_nj:    +6.0,  gas_md:    +5.0,
  gas_va:    +3.0,  gas_oh:    +2.5,  gas_wv:    +1.5,
  coal_pa:   +1.0,  coal_wv:   -0.5,  coal_oh:   +0.5,  coal_il: -0.5,
};

// Negative price % (very low in PJM, rising with more solar/wind)
const NEG_PCT: Record<string, number> = {
  wind_wv:   1.2,  wind_pa:   1.0,  wind_md:   0.8,
  wind_in:   1.5,  wind_oh:   1.2,  wind_il:   1.8,
  solar_va:  3.5,  solar_md:  3.0,  solar_nj:  2.5,
  solar_pa:  2.8,  solar_oh:  4.0,
  nuclear_pa: 0.1, nuclear_nj: 0.1, nuclear_md: 0.1,
  nuclear_il: 0.2, nuclear_oh: 0.1,
  gas_pa:    0.05, gas_nj:    0.05, gas_md:    0.05,
  gas_va:    0.05, gas_oh:    0.05, gas_wv:    0.05,
  coal_pa:   0.1,  coal_wv:   0.1,  coal_oh:   0.1, coal_il: 0.15,
};

// Seasonal multiplier (PJM is summer/winter peaky)
const SEASON = [1.12, 1.18, 0.90, 0.72, 0.78, 1.08, 1.25, 1.22, 0.88, 0.75, 0.88, 1.15];
const WIND_SEASON = [1.15, 1.10, 1.08, 1.02, 0.92, 0.82, 0.78, 0.80, 0.90, 0.98, 1.05, 1.12];
const SOLAR_SEASON = [0.75, 0.85, 0.98, 1.05, 1.12, 1.15, 1.18, 1.15, 1.05, 0.92, 0.78, 0.70];

const YEARS = [2022, 2023, 2024, 2025];

function jitter(v: number, pct = 0.06): number {
  return v * (1 + (Math.random() - 0.5) * pct * 2);
}

function seasonMult(region: string, month: number): number {
  const m = month - 1;
  if (region.startsWith("wind")) return WIND_SEASON[m];
  if (region.startsWith("solar")) return SOLAR_SEASON[m];
  return SEASON[m];
}

function buildResourceRows(
  nodeName: string, region: string, year: number, whBase: number[],
): typeof pjmNodeStatsTable.$inferInsert[] {
  const basis = BASIS[region] ?? 0;
  const rtBasis = RT_BASIS[region] ?? 0;
  const negPct = NEG_PCT[region] ?? 0.1;
  const rows: typeof pjmNodeStatsTable.$inferInsert[] = [];
  const noise = 1 + (Math.random() * 0.05 - 0.025);

  for (let month = 1; month <= 12; month++) {
    const wh = whBase[month - 1];
    if (wh === undefined) continue;
    const sm = seasonMult(region, month);
    const da = jitter((wh + basis) * sm * noise, 0.06);
    const rtSm = region.startsWith("solar") ? SOLAR_SEASON[month - 1] : sm;
    const rt = da + jitter(rtBasis * rtSm, 0.12);
    const vol = jitter(Math.abs(rtBasis) * 0.4 * sm + 2.5, 0.20);
    const negP = region.startsWith("solar")
      ? negPct * (month >= 4 && month <= 8 ? 2.0 : 0.5)
      : negPct;
    rows.push({
      node: nodeName,
      year,
      month,
      avgDaPrice: String(da.toFixed(4)),
      avgRtPrice: String(rt.toFixed(4)),
      volatility: String(vol.toFixed(4)),
      negPricePercent: String(Math.min(negP + Math.random() * 0.5, 15).toFixed(3)),
      onPeakAvg: String((da * 1.15).toFixed(4)),
      offPeakAvg: String((da * 0.82).toFixed(4)),
    });
  }
  return rows;
}

function buildZoneRows(
  zoneName: string, year: number, whBase: number[],
): typeof pjmNodeStatsTable.$inferInsert[] {
  const offset = ZONE_OFFSET[zoneName] ?? 0;
  const rows: typeof pjmNodeStatsTable.$inferInsert[] = [];
  for (let month = 1; month <= 12; month++) {
    const wh = whBase[month - 1];
    if (wh === undefined) continue;
    const avgDa = jitter(wh + offset, 0.03);
    const rtSpread = (Math.random() - 0.4) * 2.5;
    const avgRt = avgDa + rtSpread;
    const voltMult = [3.2, 3.8, 2.1, 1.4, 1.3, 1.6, 2.0, 1.9, 1.4, 1.3, 1.8, 3.5][month - 1];
    const zoneVolMult = ["PSEG", "BGE", "Eastern Hub"].includes(zoneName) ? 1.25 : 1.0;
    const volatility = jitter(voltMult * 4.5, 0.15) * zoneVolMult;
    const negPct = [0.05, 0.03, 0.4, 0.8, 0.6, 0.2, 0.1, 0.1, 0.3, 0.5, 0.2, 0.04][month - 1];
    const onPeakPrem = [12, 14, 9, 7, 8, 14, 18, 16, 9, 7, 9, 12][month - 1];
    rows.push({
      node: zoneName,
      year,
      month,
      avgDaPrice: String(avgDa.toFixed(4)),
      avgRtPrice: String(avgRt.toFixed(4)),
      volatility: String(volatility.toFixed(4)),
      negPricePercent: String((negPct * (1 + Math.random() * 0.5)).toFixed(3)),
      onPeakAvg: String((avgDa + onPeakPrem * jitter(1, 0.2)).toFixed(4)),
      offPeakAvg: String((avgDa - onPeakPrem * 0.4 * jitter(1, 0.2)).toFixed(4)),
    });
  }
  return rows;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const ALL_RESOURCE_DEFS: NodeDef[] = [
  ...WIND_WV, ...WIND_PA, ...WIND_MD_OH_IN,
  ...SOLAR_VA, ...SOLAR_MD_NJ_PA,
  ...NUCLEAR,
  ...GAS_PA, ...GAS_NJ_MD, ...GAS_VA_OH,
  ...COAL,
];

async function main() {
  // Expand resource node defs
  const resourceNodes: Array<{ name: string; region: string }> = [];
  for (const [prefix, units, region] of ALL_RESOURCE_DEFS) {
    for (let i = 1; i <= units; i++) {
      resourceNodes.push({ name: `${prefix}_${i}`, region });
    }
  }
  console.log(`Total PJM resource nodes: ${resourceNodes.length}`);
  console.log(`Zone/hub nodes: ${ZONE_NODES.length}`);

  // Check existing (node, year) pairs
  const existing = await db.execute<{ node: string; year: number }>(
    sql`SELECT DISTINCT node, year FROM pjm_node_stats`
  );
  const existingSet = new Set(existing.rows.map(r => `${r.node}|${r.year}`));
  console.log(`Already have ${existingSet.size} (node, year) pairs.`);

  const rows: typeof pjmNodeStatsTable.$inferInsert[] = [];

  // Seed zone/hub nodes
  for (const zoneName of ZONE_NODES) {
    for (const [yearStr, whBase] of Object.entries(WH_BASE)) {
      const year = Number(yearStr);
      if (existingSet.has(`${zoneName}|${year}`)) continue;
      rows.push(...buildZoneRows(zoneName, year, whBase));
    }
  }

  // Seed resource nodes
  for (const { name, region } of resourceNodes) {
    for (const [yearStr, whBase] of Object.entries(WH_BASE)) {
      const year = Number(yearStr);
      if (existingSet.has(`${name}|${year}`)) continue;
      rows.push(...buildResourceRows(name, region, year, whBase));
    }
  }

  if (rows.length === 0) {
    console.log("Nothing new to seed.");
    process.exit(0);
  }

  const BATCH = 500;
  console.log(`Inserting ${rows.length} rows in batches of ${BATCH}…`);
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(pjmNodeStatsTable).values(rows.slice(i, i + BATCH));
    process.stdout.write(`\r  ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }
  console.log("\nDone seeding PJM nodes.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
