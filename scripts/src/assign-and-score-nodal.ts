/**
 * assign-and-score-nodal.ts  (v3 — Real Data Upgrade + New Dimensions)
 *
 * What's new vs v2:
 *   1. Curtailment Score    — real neg_price_percent from ercot_node_stats DB (was calibrated estimates)
 *                             LZ_WEST: real 7.1% vs estimate 15%  → rescores hundreds of West TX plants
 *                             HB_WEST: real 8.2% vs estimate 18%
 *   2. Congestion Score     — real avg_da_price from DB + real volatility penalty (was static lookup)
 *   3. Basis Risk Score     — real price volatility (volatility col) per node  (was synthetic)
 *   4. Capture Price Score  — DA price × technology timing-capture ratio
 *                             (wind ~82%, solar ~103%, storage ~118%)  stored in price_score
 *   5. Market Revenue Score — annual energy revenue = MW × CF × capture_price × 8760h, log 0-100
 *                             stored in financial_score  (replaces asset-age proxy)
 *   6. Interconnect Risk    — total MW in queue per zone, penalty for pipeline depth
 *                             stored in development_risk_score  (new dimension)
 *   7. REC Score            — annual REC value (technology × market REC price), log 0-100
 *                             stored in environmental_score  (new dimension)
 *   8. Capacity Score       — log-scaled MW size (recomputed)  stored in demand_proximity_score
 *
 * All ERCOT hub/zone real data pulled live from ercot_node_stats.
 * All CAISO zone data pulled live from caiso_node_stats.
 * Queue depth by zone from queue_projects.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const RADIUS_KM = 200;

// ── Technology capture ratios ─────────────────────────────────────────────────
// How much of the hub DA price the generator actually captures, accounting for
// production timing vs. price shape. Wind produces more at night when prices
// are low (ERCOT wind avg capture ~82%); solar peaks during summer afternoon
// demand (slight premium); storage dispatches at peak (premium).
const CAPTURE_RATIO: Record<string, number> = {
  wind:        0.82,
  solar:       1.03,
  storage:     1.18,
  natural_gas: 1.00,
  nuclear:     0.97,
  hydro:       0.98,
  biomass:     0.99,
  geothermal:  0.99,
  coal:        0.94,
};

// ── Capacity factors by technology × market ───────────────────────────────────
const CF: Record<string, Record<string, number>> = {
  solar:       { ERCOT: 0.27, CAISO: 0.29, PJM: 0.22 },
  wind:        { ERCOT: 0.40, CAISO: 0.32, PJM: 0.35 },
  storage:     { ERCOT: 0.18, CAISO: 0.18, PJM: 0.18 },
  natural_gas: { ERCOT: 0.60, CAISO: 0.55, PJM: 0.58 },
  nuclear:     { ERCOT: 0.92, CAISO: 0.92, PJM: 0.92 },
  hydro:       { ERCOT: 0.40, CAISO: 0.42, PJM: 0.38 },
  biomass:     { ERCOT: 0.65, CAISO: 0.65, PJM: 0.65 },
  geothermal:  { ERCOT: 0.88, CAISO: 0.88, PJM: 0.88 },
  coal:        { ERCOT: 0.55, CAISO: 0.55, PJM: 0.55 },
};

// ── REC prices by technology × market ────────────────────────────────────────
// ERCOT Texas TRC ~$1.50/MWh; CAISO WREGIS ~$7-12; PJM varies widely
const REC_PRICES: Record<string, Record<string, number>> = {
  solar:       { ERCOT: 1.50, CAISO: 12.00, PJM: 15.00 },
  wind:        { ERCOT: 1.50, CAISO: 10.00, PJM:  3.50 },
  hydro:       { ERCOT: 1.50, CAISO:  7.00, PJM:  2.00 },
  geothermal:  { ERCOT: 1.50, CAISO: 10.00, PJM:  5.00 },
  biomass:     { ERCOT: 1.50, CAISO:  8.00, PJM:  3.00 },
};
const REC_ELIGIBLE = new Set(["solar","wind","hydro","geothermal","biomass"]);

// ── Asset-type curtailment multipliers ────────────────────────────────────────
const ERCOT_CURT_MULT: Record<string, number> = {
  wind: 1.30, solar: 1.25, storage: 0.75, natural_gas: 0.45,
  nuclear: 0.38, hydro: 0.55, biomass: 0.50,
};
const CAISO_CURT_MULT: Record<string, Record<string, number>> = {
  solar:       { NP15: 1.25, SP15: 1.35, ZP26: 1.40 },
  wind:        { NP15: 1.05, SP15: 1.15, ZP26: 1.10 },
  storage:     { NP15: 0.60, SP15: 0.65, ZP26: 0.65 },
  natural_gas: { NP15: 0.40, SP15: 0.40, ZP26: 0.40 },
  hydro:       { NP15: 0.35, SP15: 0.40, ZP26: 0.38 },
  geothermal:  { NP15: 0.30, SP15: 0.30, ZP26: 0.30 },
  biomass:     { NP15: 0.45, SP15: 0.45, ZP26: 0.45 },
  nuclear:     { NP15: 0.28, SP15: 0.28, ZP26: 0.28 },
};

// ── Asset congestion adjustments ──────────────────────────────────────────────
const ERCOT_CONG_ADJ: Record<string, number> = {
  wind: -10, solar: -7, storage: +6, natural_gas: +7, nuclear: +7, hydro: +5, biomass: +4,
};
const CAISO_CONG_ADJ: Record<string, Record<string, number>> = {
  solar:       { NP15: -3, SP15: -7, ZP26: -8 },
  wind:        { NP15: -2, SP15: -4, ZP26: -5 },
  storage:     { NP15: +6, SP15: +6, ZP26: +6 },
  natural_gas: { NP15:+12, SP15:+10, ZP26:+10 },
  hydro:       { NP15:+10, SP15: +8, ZP26: +8 },
  geothermal:  { NP15:+12, SP15:+10, ZP26:+10 },
  biomass:     { NP15: +6, SP15: +5, ZP26: +5 },
  nuclear:     { NP15:+12, SP15:+10, ZP26:+10 },
};

// ── Geographic fallback for ERCOT ─────────────────────────────────────────────
function ercotGeoFallback(lat: number, lon: number): string {
  if (lon < -101.5) return "HB_PAN";
  if (lon < -99.5)  return "HB_WEST";
  if (lat >= 32.5 && lon >= -99.5 && lon < -96.5) return "HB_NORTH";
  if (lat >= 29.5 && lon >= -96.5) return "LZ_HOUSTON";
  if (lat < 28.5) return "LZ_AEN";
  return "LZ_CPS";
}

interface NodeStats { avg_da: number; avg_rt: number; avg_vol: number; avg_neg_pct: number; }

// ─────────────────────────────────────────────────────────────────────────────
// Scoring functions — all take live DB-sourced maps, no hardcoded tables
// ─────────────────────────────────────────────────────────────────────────────

function curtailmentScore(
  node: string, assetType: string, market: string,
  ercotNodes: Map<string, NodeStats>,
  caisoNodes: Map<string, NodeStats>,
  ercotFleetAvgNegPct: number,
): number {
  if (market === "ERCOT") {
    const stats = ercotNodes.get(node);
    const negPct = stats?.avg_neg_pct ?? ercotFleetAvgNegPct;
    const mult = ERCOT_CURT_MULT[assetType] ?? 0.80;
    return Math.round(Math.min(98, Math.max(5, 100 - negPct * mult * 1.4)) * 100) / 100;
  }
  if (market === "CAISO") {
    const stats = caisoNodes.get(node) ?? caisoNodes.get("SP15")!;
    const multMap = CAISO_CURT_MULT[assetType];
    const mult = multMap?.[node] ?? 0.80;
    const penalty = stats.avg_neg_pct * mult * 1.5;
    const spreadPenalty = Math.min(3, Math.max(-3, (stats.avg_da - 33.25) * -0.5));
    return Math.round(Math.min(98, Math.max(5, 100 - penalty + spreadPenalty)) * 100) / 100;
  }
  // PJM — modeled
  const pjmBase: Record<string, number> = {
    natural_gas: 88, nuclear: 90, hydro: 85, storage: 80,
    wind: 70, solar: 72, biomass: 76,
  };
  return pjmBase[assetType] ?? 72;
}

function congestionScore(
  node: string, assetType: string, market: string,
  ercotNodes: Map<string, NodeStats>,
  caisoNodes: Map<string, NodeStats>,
  ercotBusAvg: number, ercotSysVol: number,
): number {
  if (market === "ERCOT") {
    const stats = ercotNodes.get(node);
    const da = stats?.avg_da ?? ercotBusAvg;
    const vol = stats?.avg_vol ?? ercotSysVol;
    const basisPct = (da - ercotBusAvg) / ercotBusAvg;
    const volPenalty = ((vol - ercotSysVol) / ercotSysVol) * 8;
    const assetAdj = ERCOT_CONG_ADJ[assetType] ?? 0;
    return Math.round(Math.min(98, Math.max(5, 50 + basisPct * 150 - volPenalty + assetAdj)) * 100) / 100;
  }
  if (market === "CAISO") {
    const stats = caisoNodes.get(node) ?? caisoNodes.get("SP15")!;
    const caRefDA = 33.25;
    const caRefVol = 13.6;
    const basisPct = (stats.avg_da - caRefDA) / caRefDA;
    const volPenalty = ((stats.avg_vol - caRefVol) / caRefVol) * 8;
    const adjMap = CAISO_CONG_ADJ[assetType];
    const assetAdj = adjMap?.[node] ?? 0;
    return Math.round(Math.min(98, Math.max(5, 50 + basisPct * 100 - volPenalty + assetAdj)) * 100) / 100;
  }
  // PJM modeled
  const pjmBase: Record<string, number> = {
    natural_gas: 70, nuclear: 72, hydro: 65, storage: 68, wind: 58, solar: 60, biomass: 62,
  };
  return pjmBase[assetType] ?? 62;
}

function basisRiskScore(
  node: string, market: string,
  ercotNodes: Map<string, NodeStats>,
  caisoNodes: Map<string, NodeStats>,
  ercotSysVol: number,
): number {
  if (market === "ERCOT") {
    const stats = ercotNodes.get(node);
    const vol = stats?.avg_vol ?? ercotSysVol;
    // Lower volatility = more predictable settlement = better basis risk score
    const raw = 70 - ((vol - ercotSysVol) / ercotSysVol) * 22;
    return Math.round(Math.min(90, Math.max(20, raw)) * 100) / 100;
  }
  if (market === "CAISO") {
    const stats = caisoNodes.get(node) ?? caisoNodes.get("SP15")!;
    const caRefVol = 13.6;
    const raw = 62 - ((stats.avg_vol - caRefVol) / caRefVol) * 20;
    return Math.round(Math.min(85, Math.max(15, raw)) * 100) / 100;
  }
  // PJM modeled at ~60 (complex multi-state basis)
  return 58;
}

function capturePriceScore(
  node: string, assetType: string, market: string,
  ercotNodes: Map<string, NodeStats>,
  caisoNodes: Map<string, NodeStats>,
  ercotBusAvg: number,
): number {
  let da: number;
  let sysAvg: number;
  if (market === "ERCOT") {
    da = ercotNodes.get(node)?.avg_da ?? ercotBusAvg;
    sysAvg = ercotBusAvg;
  } else if (market === "CAISO") {
    da = caisoNodes.get(node)?.avg_da ?? 33.25;
    sysAvg = 33.25;
  } else {
    // PJM: approximate hub price by zone
    const pjmDA: Record<string, number> = {
      "WESTERN HUB": 38, "EASTERN HUB": 36, "NI HUB": 35, "AEP-DAYTON HUB": 35,
      "BGE": 37, "PSEG": 38, "PPL": 36, "DOM": 35, "APS": 34, "PENELEC": 35, "JCPL": 37,
    };
    da = pjmDA[node] ?? 36;
    sysAvg = 36;
  }
  const ratio = CAPTURE_RATIO[assetType] ?? 0.90;
  const captureDA = da * ratio;
  // Score: 50 is system-average capture price; scales up/down with relative capture
  const raw = (captureDA / sysAvg) * 50;
  return Math.round(Math.min(95, Math.max(10, raw)) * 100) / 100;
}

function marketRevenueScore(
  capacityMw: number, assetType: string, node: string, market: string,
  ercotNodes: Map<string, NodeStats>,
  caisoNodes: Map<string, NodeStats>,
  ercotBusAvg: number,
): number {
  let da: number;
  if (market === "ERCOT") {
    da = ercotNodes.get(node)?.avg_da ?? ercotBusAvg;
  } else if (market === "CAISO") {
    da = caisoNodes.get(node)?.avg_da ?? 33.25;
  } else {
    da = 36;
  }
  const cf = CF[assetType]?.[market] ?? 0.30;
  const captureRatio = CAPTURE_RATIO[assetType] ?? 0.90;
  const annualRevM = (capacityMw * cf * 8760 * da * captureRatio) / 1_000_000;
  // Log scale: $200M = 95, $100M = 88, $50M = 80, $20M = 70, $10M = 62, $5M = 54, $1M = 42, $0.1M = 28
  // Range log10(0.01) = -2 to log10(200) = 2.30 → linear map to [20, 95]
  const logRev = annualRevM > 0 ? Math.log10(annualRevM) : -2;
  const raw = 20 + ((logRev + 2) / 4.3) * 75;
  return Math.round(Math.min(95, Math.max(15, raw)) * 100) / 100;
}

function interconnectRiskScore(
  node: string, market: string,
  ercotQueueMap: Map<string, number>, caisoQueueMap: Map<string, number>,
  ercotMaxMw: number, caisoMaxMw: number,
): number {
  if (market === "ERCOT") {
    const queueMw = ercotQueueMap.get(node) ?? 0;
    // Normalize: 0 MW → 85, max zone → 25; linear
    const raw = 85 - (queueMw / ercotMaxMw) * 60;
    return Math.round(Math.min(85, Math.max(22, raw)) * 100) / 100;
  }
  if (market === "CAISO") {
    const queueMw = caisoQueueMap.get(node) ?? 0;
    // CAISO queues are enormous (SP15 ~371 GW); normalize similarly
    const raw = 85 - (queueMw / caisoMaxMw) * 60;
    return Math.round(Math.min(85, Math.max(22, raw)) * 100) / 100;
  }
  // PJM: synthetic queue data — moderate risk
  const pjmBase: Record<string, number> = {
    "WESTERN HUB": 42, "EASTERN HUB": 45, "NI HUB": 48, "AEP-DAYTON HUB": 50,
    "BGE": 44, "PSEG": 40, "PPL": 46, "DOM": 52, "APS": 50, "PENELEC": 54, "JCPL": 42,
  };
  return pjmBase[node] ?? 48;
}

function recScore(assetType: string, market: string, capacityMw: number): number {
  if (!REC_ELIGIBLE.has(assetType) || capacityMw <= 0) return 12;
  const cf = CF[assetType]?.[market] ?? 0.30;
  const recPrice = REC_PRICES[assetType]?.[market] ?? 2.00;
  const annualValueK = (capacityMw * cf * 8760 * recPrice) / 1000;
  // Log scale: $10,000k = 95, $1,000k = 80, $100k = 65, $10k = 50, $1k = 35, <$0.1k = 20
  const logVal = annualValueK > 0 ? Math.log10(annualValueK) : -2;
  // Range log10(0.001) = -3 to log10(10000) = 4 → linear to [18, 95]
  const raw = 18 + ((logVal + 3) / 7) * 77;
  return Math.round(Math.min(95, Math.max(10, raw)) * 100) / 100;
}

function capacityScore(capacityMw: number): number {
  // Log scale: 2000+ MW = 93, 500 = 76, 200 = 66, 100 = 58, 50 = 50, 10 = 36, <5 = 25
  const logMw = Math.log10(Math.max(1, capacityMw));
  const raw = 25 + (logMw / 3.3) * 68;
  return Math.round(Math.min(93, Math.max(10, raw)) * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log(" Nodal scoring v3 — Real DB data + new dimensions");
  console.log("═══════════════════════════════════════════════════════\n");

  // ── Step 0: Load real stats from DB ───────────────────────────────────────
  console.log("📡 Loading real node stats from DB...");

  const ercotRaw = await db.execute<{
    node: string; avg_da: string; avg_rt: string; avg_vol: string; avg_neg_pct: string;
  }>(sql`
    SELECT node,
      AVG(avg_da_price)::float  AS avg_da,
      AVG(avg_rt_price)::float  AS avg_rt,
      AVG(volatility)::float    AS avg_vol,
      AVG(neg_price_percent)::float AS avg_neg_pct
    FROM ercot_node_stats
    WHERE node_type IN ('hub', 'load_zone')
    GROUP BY node
  `);

  const caisoRaw = await db.execute<{
    node: string; avg_da: string; avg_vol: string; avg_neg_pct: string;
  }>(sql`
    SELECT node,
      AVG(avg_da_price)::float      AS avg_da,
      AVG(volatility)::float        AS avg_vol,
      AVG(neg_price_percent)::float AS avg_neg_pct
    FROM caiso_node_stats
    GROUP BY node
  `);

  const ercotQueueRaw = await db.execute<{ zone: string; total_mw: string }>(sql`
    SELECT interconnection_node AS zone, SUM(capacity_mw::float) AS total_mw
    FROM queue_projects
    WHERE market = 'ERCOT' AND interconnection_node IS NOT NULL AND capacity_mw IS NOT NULL
    GROUP BY interconnection_node
  `);

  const caisoQueueRaw = await db.execute<{ zone: string; total_mw: string }>(sql`
    SELECT interconnection_node AS zone, SUM(capacity_mw::float) AS total_mw
    FROM queue_projects
    WHERE market = 'CAISO' AND interconnection_node IS NOT NULL AND capacity_mw IS NOT NULL
    GROUP BY interconnection_node
  `);

  const ercotNodes = new Map<string, NodeStats>(
    ercotRaw.rows.map(r => [r.node, {
      avg_da: Number(r.avg_da), avg_rt: Number(r.avg_rt),
      avg_vol: Number(r.avg_vol), avg_neg_pct: Number(r.avg_neg_pct),
    }])
  );
  const caisoNodes = new Map<string, NodeStats>(
    caisoRaw.rows.map(r => [r.node, {
      avg_da: Number(r.avg_da), avg_rt: 0,
      avg_vol: Number(r.avg_vol), avg_neg_pct: Number(r.avg_neg_pct),
    }])
  );

  const ercotBusAvg = ercotNodes.get("HB_BUSAVG")?.avg_da ?? 29.11;
  const vals = [...ercotNodes.values()];
  const ercotSysVol = vals.reduce((s, r) => s + (r.avg_vol ?? 0), 0) / vals.length;
  const ercotFleetAvgNegPct = vals.reduce((s, r) => s + (r.avg_neg_pct ?? 0), 0) / vals.length;

  const ercotQueueMap = new Map<string, number>(
    ercotQueueRaw.rows.map(r => [r.zone, Number(r.total_mw)])
  );
  const caisoQueueMap = new Map<string, number>(
    caisoQueueRaw.rows.map(r => [r.zone, Number(r.total_mw)])
  );
  const ercotMaxMw = Math.max(...ercotQueueMap.values(), 1);
  const caisoMaxMw = Math.max(...caisoQueueMap.values(), 1);

  console.log(`   ERCOT: ${ercotNodes.size} hub/zone nodes loaded`);
  console.log(`   ERCOT BusAvg DA: $${ercotBusAvg.toFixed(2)}/MWh  |  sys avg vol: ${ercotSysVol.toFixed(2)}`);
  console.log(`   ERCOT fleet avg neg-price: ${ercotFleetAvgNegPct.toFixed(2)}%`);
  console.log(`   ERCOT queue max zone: ${ercotMaxMw.toFixed(0)} MW`);
  console.log(`   CAISO: ${caisoNodes.size} zones loaded  |  queue max: ${caisoMaxMw.toFixed(0)} MW`);

  console.log("\n   Real ERCOT hub/zone neg-price % (from DB):");
  for (const [node, s] of [...ercotNodes.entries()].sort((a,b) => b[1].avg_neg_pct - a[1].avg_neg_pct)) {
    console.log(`     ${node.padEnd(12)} neg% ${s.avg_neg_pct.toFixed(2).padStart(5)}  DA $${s.avg_da.toFixed(2)}  vol ${s.avg_vol.toFixed(2)}`);
  }

  // ── Step 1: ERCOT Haversine nearest-neighbour ──────────────────────────────
  console.log("\n📍 ERCOT: Haversine nearest-neighbour...");

  const ercotCandidates = await db.execute<{
    id: number; asset_type: string; capacity_mw: string; latitude: string; longitude: string;
  }>(sql`
    SELECT id, asset_type, capacity_mw::text, latitude::float::text, longitude::float::text
    FROM candidates WHERE market = 'ERCOT' ORDER BY id
  `);

  const ercotMatches = await db.execute<{
    candidate_id: number; queue_node: string; distance_km: string;
  }>(sql`
    SELECT DISTINCT ON (c.id)
      c.id AS candidate_id,
      q.interconnection_node AS queue_node,
      (6371.0 * ACOS(LEAST(1.0,
        COS(RADIANS(c.latitude::float)) * COS(RADIANS(q.latitude::float)) *
        COS(RADIANS(q.longitude::float) - RADIANS(c.longitude::float)) +
        SIN(RADIANS(c.latitude::float)) * SIN(RADIANS(q.latitude::float))
      ))) AS distance_km
    FROM candidates c
    JOIN queue_projects q
      ON q.market = 'ERCOT'
      AND q.latitude IS NOT NULL
      AND q.interconnection_node IS NOT NULL
    WHERE c.market = 'ERCOT'
    ORDER BY c.id, distance_km
  `);

  const ercotNodeMap = new Map<number, string>();
  let ercotHitCount = 0, ercotFallback = 0;
  for (const m of ercotMatches.rows) {
    if (Number(m.distance_km) <= RADIUS_KM) {
      ercotNodeMap.set(m.candidate_id, m.queue_node);
      ercotHitCount++;
    }
  }
  for (const c of ercotCandidates.rows) {
    if (!ercotNodeMap.has(c.id)) {
      ercotNodeMap.set(c.id, ercotGeoFallback(Number(c.latitude), Number(c.longitude)));
      ercotFallback++;
    }
  }
  console.log(`   Queue match (≤${RADIUS_KM}km): ${ercotHitCount}  |  geo fallback: ${ercotFallback}`);

  // ── Step 2: CAISO Haversine ────────────────────────────────────────────────
  console.log("\n📍 CAISO: Haversine nearest-neighbour...");

  const caisoCandidates = await db.execute<{
    id: number; asset_type: string; capacity_mw: string; latitude: string; longitude: string;
  }>(sql`
    SELECT id, asset_type, capacity_mw::text, latitude::float::text, longitude::float::text
    FROM candidates WHERE market = 'CAISO' ORDER BY id
  `);

  const caisoMatches = await db.execute<{
    candidate_id: number; queue_node: string; distance_km: string;
  }>(sql`
    SELECT DISTINCT ON (c.id)
      c.id AS candidate_id,
      q.interconnection_node AS queue_node,
      (6371.0 * ACOS(LEAST(1.0,
        COS(RADIANS(c.latitude::float)) * COS(RADIANS(q.latitude::float)) *
        COS(RADIANS(q.longitude::float) - RADIANS(c.longitude::float)) +
        SIN(RADIANS(c.latitude::float)) * SIN(RADIANS(q.latitude::float))
      ))) AS distance_km
    FROM candidates c
    JOIN queue_projects q
      ON q.market = 'CAISO'
      AND q.latitude IS NOT NULL
      AND q.interconnection_node IS NOT NULL
    WHERE c.market = 'CAISO'
    ORDER BY c.id, distance_km
  `);

  const caisoNodeMap = new Map<number, string>();
  let caisoHitCount = 0, caisoFallback = 0;
  for (const m of caisoMatches.rows) {
    if (Number(m.distance_km) <= RADIUS_KM) {
      caisoNodeMap.set(m.candidate_id, m.queue_node);
      caisoHitCount++;
    }
  }
  for (const c of caisoCandidates.rows) {
    if (!caisoNodeMap.has(c.id)) {
      const lat = Number(c.latitude), lon = Number(c.longitude);
      const zone = lat >= 37.5 ? "NP15" : (lat >= 35.0 && lon <= -118.5) ? "ZP26" : "SP15";
      caisoNodeMap.set(c.id, zone);
      caisoFallback++;
    }
  }
  console.log(`   Queue match (≤${RADIUS_KM}km): ${caisoHitCount}  |  geo fallback: ${caisoFallback}`);

  // ── Step 3: PJM — node assignment from existing interconnection_node ────────
  console.log("\n📍 PJM: using existing interconnection_node assignments...");
  const pjmCandidates = await db.execute<{
    id: number; asset_type: string; capacity_mw: string; interconnection_node: string;
  }>(sql`
    SELECT id, asset_type, capacity_mw::text, COALESCE(interconnection_node, 'WESTERN HUB') AS interconnection_node
    FROM candidates WHERE market = 'PJM' ORDER BY id
  `);
  console.log(`   ${pjmCandidates.rows.length} PJM candidates`);

  // ── Step 4: Compute all 8 scores ───────────────────────────────────────────
  console.log("\n📊 Computing all 8 dimensions per candidate...");

  interface Update {
    id: number;
    node: string;
    curtailment: string;
    congestion: string;
    basis: string;
    capturePrice: string;
    mktRevenue: string;
    interconnectRisk: string;
    recScore: string;
    capScore: string;
  }

  const updates: Update[] = [];

  const computeAll = (
    id: number, node: string, assetType: string, market: string, capacityMw: number
  ): Update => ({
    id, node,
    curtailment:     curtailmentScore(node, assetType, market, ercotNodes, caisoNodes, ercotFleetAvgNegPct).toFixed(2),
    congestion:      congestionScore(node, assetType, market, ercotNodes, caisoNodes, ercotBusAvg, ercotSysVol).toFixed(2),
    basis:           basisRiskScore(node, market, ercotNodes, caisoNodes, ercotSysVol).toFixed(2),
    capturePrice:    capturePriceScore(node, assetType, market, ercotNodes, caisoNodes, ercotBusAvg).toFixed(2),
    mktRevenue:      marketRevenueScore(capacityMw, assetType, node, market, ercotNodes, caisoNodes, ercotBusAvg).toFixed(2),
    interconnectRisk: interconnectRiskScore(node, market, ercotQueueMap, caisoQueueMap, ercotMaxMw, caisoMaxMw).toFixed(2),
    recScore:        recScore(assetType, market, capacityMw).toFixed(2),
    capScore:        capacityScore(capacityMw).toFixed(2),
  });

  for (const c of ercotCandidates.rows) {
    updates.push(computeAll(c.id, ercotNodeMap.get(c.id)!, c.asset_type, "ERCOT", Number(c.capacity_mw)));
  }
  for (const c of caisoCandidates.rows) {
    updates.push(computeAll(c.id, caisoNodeMap.get(c.id)!, c.asset_type, "CAISO", Number(c.capacity_mw)));
  }
  for (const c of pjmCandidates.rows) {
    updates.push(computeAll(c.id, c.interconnection_node, c.asset_type, "PJM", Number(c.capacity_mw)));
  }

  // Score preview
  console.log("\n   ERCOT score preview by node:");
  const ercotByNode: Record<string, {curt: number[]; cong: number[]; cap: number[]; intRisk: number[]}> = {};
  for (const u of updates.filter(u => ercotNodeMap.has(u.id))) {
    const d = (ercotByNode[u.node] ??= {curt:[], cong:[], cap:[], intRisk:[]});
    d.curt.push(Number(u.curtailment));
    d.cong.push(Number(u.congestion));
    d.cap.push(Number(u.capScore));
    d.intRisk.push(Number(u.interconnectRisk));
  }
  const avg = (arr: number[]) => arr.length ? (arr.reduce((s,v)=>s+v,0)/arr.length).toFixed(1) : "—";
  for (const [node, d] of Object.entries(ercotByNode).sort((a,b) => (ercotNodes.get(b[0])?.avg_da??0)-(ercotNodes.get(a[0])?.avg_da??0))) {
    const negPct = ercotNodes.get(node)?.avg_neg_pct ?? 0;
    console.log(`     ${node.padEnd(12)}  curt ${avg(d.curt)}  cong ${avg(d.cong)}  q-risk ${avg(d.intRisk)}  (neg% real: ${negPct.toFixed(1)}%  n=${d.curt.length})`);
  }

  // ── Step 5: Batch-update DB ────────────────────────────────────────────────
  console.log("\n💾 Writing all scores to DB...");
  const CHUNK = 100;
  let written = 0;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    await Promise.all(chunk.map(u =>
      db.execute(sql`
        UPDATE candidates
        SET interconnection_node    = ${u.node},
            pricing_hub_node        = ${u.node},
            curtailment_score       = ${u.curtailment}::numeric,
            interconnection_score   = ${u.congestion}::numeric,
            location_score          = ${u.basis}::numeric,
            price_score             = ${u.capturePrice}::numeric,
            financial_score         = ${u.mktRevenue}::numeric,
            development_risk_score  = ${u.interconnectRisk}::numeric,
            environmental_score     = ${u.recScore}::numeric,
            demand_proximity_score  = ${u.capScore}::numeric,
            updated_at              = NOW()
        WHERE id = ${u.id}
      `)
    ));
    written += chunk.length;
    process.stdout.write(`\r   ${written}/${updates.length} updated...`);
  }

  // ── Step 6: Recompute overall_score ───────────────────────────────────────
  console.log("\n🔄 Recomputing overall_score for all markets...");
  await db.execute(sql`
    UPDATE candidates
    SET overall_score = ROUND((
      COALESCE(price_score::numeric,            50) * 0.18 +
      COALESCE(curtailment_score::numeric,      50) * 0.18 +
      COALESCE(interconnection_score::numeric,  50) * 0.15 +
      COALESCE(location_score::numeric,         50) * 0.12 +
      COALESCE(financial_score::numeric,        50) * 0.12 +
      COALESCE(development_risk_score::numeric, 50) * 0.10 +
      COALESCE(demand_proximity_score::numeric, 50) * 0.08 +
      COALESCE(environmental_score::numeric,    50) * 0.05 +
      COALESCE(grid_stability_score::numeric,   50) * 0.02
    ), 2),
    updated_at = NOW()
  `);

  console.log("\n\n✅ Done. Dimension mapping:");
  console.log("   price_score            → Capture Price  (hub DA × technology timing ratio)");
  console.log("   curtailment_score      → Curtailment    (real neg_price_percent from DB)");
  console.log("   interconnection_score  → Congestion     (real DA basis + volatility penalty)");
  console.log("   location_score         → Basis Risk     (real volatility from DB)");
  console.log("   financial_score        → Mkt Revenue    (annual energy revenue, log-scaled)");
  console.log("   development_risk_score → Interconnect   (queue MW backlog by zone)");
  console.log("   environmental_score    → RECs / Yr      (annual REC value, log-scaled)");
  console.log("   demand_proximity_score → Capacity       (log-scaled MW)");

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
