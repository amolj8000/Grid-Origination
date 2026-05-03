import { Router } from "express";
import { db, ercotNodeStatsTable, ercotNodalStatsTable, caisoNodeStatsTable, pjmNodeStatsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import {
  ListErcotNodeStatsQueryParams,
  ListErcotNodalStatsQueryParams,
  ListCaisoNodeStatsQueryParams,
  ListPjmNodeStatsQueryParams,
} from "@workspace/api-zod";

const router = Router();

// ERCOT Settlement Points — distinct resource node names (excludes HB_* and LZ_*)
router.get("/ercot-settlement-points", async (req, res) => {
  try {
    // Return real resource nodes from ercot_node_stats (seeded from CDR 12301)
    const rows = await db.execute<{ node: string }>(
      sql`SELECT DISTINCT node
          FROM ercot_node_stats
          WHERE node_type = 'resource_node'
          ORDER BY node`
    );
    res.json(rows.rows.map(r => r.node));
  } catch (err) {
    req.log.error({ err }, "listErcotSettlementPoints error");
    res.status(500).json({ error: "internal_error", message: "Failed to list settlement points" });
  }
});

// CAISO Settlement Points — distinct resource node names (excludes zones)
router.get("/caiso-settlement-points", async (req, res) => {
  try {
    const rows = await db.execute<{ node: string }>(
      sql`SELECT DISTINCT node
          FROM caiso_node_stats
          WHERE node NOT IN ('NP15', 'SP15', 'ZP26')
          ORDER BY node`
    );
    res.json(rows.rows.map(r => r.node));
  } catch (err) {
    req.log.error({ err }, "listCaisoSettlementPoints error");
    res.status(500).json({ error: "internal_error", message: "Failed to list CAISO settlement points" });
  }
});

// ERCOT Node Stats
router.get("/ercot-node-stats", async (req, res) => {
  try {
    // Parse manually to support new params without waiting for codegen
    const { node, nodeType, year, month, sortBy, limit: limitStr } = req.query as Record<string, string | undefined>;
    const parsedYear = year !== undefined ? Number(year) : undefined;
    const parsedMonth = month !== undefined ? Number(month) : undefined;
    const parsedLimit = limitStr !== undefined ? Number(limitStr) : undefined;

    const conditions = [];
    if (node) conditions.push(eq(ercotNodeStatsTable.node, node));
    if (nodeType) conditions.push(eq(ercotNodeStatsTable.nodeType, nodeType));
    if (parsedYear !== undefined) conditions.push(eq(ercotNodeStatsTable.year, parsedYear));
    if (parsedMonth !== undefined) conditions.push(eq(ercotNodeStatsTable.month, parsedMonth));

    let rows = await db.select().from(ercotNodeStatsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(ercotNodeStatsTable.year, ercotNodeStatsTable.month);

    // Apply sort in JS for flexibility
    if (sortBy === "neg_price_percent") {
      rows.sort((a, b) => Number(b.negPricePercent ?? 0) - Number(a.negPricePercent ?? 0));
    } else if (sortBy === "volatility") {
      rows.sort((a, b) => Number(b.volatility ?? 0) - Number(a.volatility ?? 0));
    } else if (sortBy === "avg_rt_price") {
      rows.sort((a, b) => Number(b.avgRtPrice ?? 0) - Number(a.avgRtPrice ?? 0));
    } else if (sortBy === "price_range") {
      rows.sort((a, b) => (Number(b.maxPrice ?? 0) - Number(b.minPrice ?? 0)) - (Number(a.maxPrice ?? 0) - Number(a.minPrice ?? 0)));
    }
    if (parsedLimit) rows = rows.slice(0, parsedLimit);

    res.json(rows.map(r => ({
      ...r,
      avgDaPrice: Number(r.avgDaPrice),
      avgRtPrice: r.avgRtPrice ? Number(r.avgRtPrice) : null,
      volatility: r.volatility ? Number(r.volatility) : null,
      negPricePercent: r.negPricePercent ? Number(r.negPricePercent) : null,
      onPeakAvg: r.onPeakAvg ? Number(r.onPeakAvg) : null,
      offPeakAvg: r.offPeakAvg ? Number(r.offPeakAvg) : null,
      minPrice: r.minPrice ? Number(r.minPrice) : null,
      maxPrice: r.maxPrice ? Number(r.maxPrice) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "listErcotNodeStats error");
    res.status(500).json({ error: "internal_error", message: "Failed to list ERCOT node stats" });
  }
});

// ERCOT Nodal Stats
router.get("/ercot-nodal-stats", async (req, res) => {
  try {
    const parsed = ListErcotNodalStatsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", message: parsed.error.message });
      return;
    }
    const { settlementPoint, year, month } = parsed.data;
    const conditions = [];
    if (settlementPoint) conditions.push(eq(ercotNodalStatsTable.settlementPoint, settlementPoint));
    if (year !== undefined) conditions.push(eq(ercotNodalStatsTable.year, year));
    if (month !== undefined) conditions.push(eq(ercotNodalStatsTable.month, month));

    const rows = await db.select().from(ercotNodalStatsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(ercotNodalStatsTable.year, ercotNodalStatsTable.month);

    res.json(rows.map(r => ({
      ...r,
      avgDaPrice: Number(r.avgDaPrice),
      avgRtPrice: r.avgRtPrice ? Number(r.avgRtPrice) : null,
      stdDev: r.stdDev ? Number(r.stdDev) : null,
      negPricePercent: r.negPricePercent ? Number(r.negPricePercent) : null,
      onPeakAvg: r.onPeakAvg ? Number(r.onPeakAvg) : null,
      offPeakAvg: r.offPeakAvg ? Number(r.offPeakAvg) : null,
      minPrice: r.minPrice ? Number(r.minPrice) : null,
      maxPrice: r.maxPrice ? Number(r.maxPrice) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "listErcotNodalStats error");
    res.status(500).json({ error: "internal_error", message: "Failed to list ERCOT nodal stats" });
  }
});

// CAISO Node Stats
router.get("/caiso-node-stats", async (req, res) => {
  try {
    const parsed = ListCaisoNodeStatsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", message: parsed.error.message });
      return;
    }
    const { node, year, month } = parsed.data;
    const conditions = [];
    if (node) conditions.push(eq(caisoNodeStatsTable.node, node));
    if (year !== undefined) conditions.push(eq(caisoNodeStatsTable.year, year));
    if (month !== undefined) conditions.push(eq(caisoNodeStatsTable.month, month));

    const rows = await db.select().from(caisoNodeStatsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(caisoNodeStatsTable.year, caisoNodeStatsTable.month);

    res.json(rows.map(r => ({
      ...r,
      avgDaPrice: Number(r.avgDaPrice),
      avgRtPrice: r.avgRtPrice ? Number(r.avgRtPrice) : null,
      volatility: r.volatility ? Number(r.volatility) : null,
      negPricePercent: r.negPricePercent ? Number(r.negPricePercent) : null,
      onPeakAvg: r.onPeakAvg ? Number(r.onPeakAvg) : null,
      offPeakAvg: r.offPeakAvg ? Number(r.offPeakAvg) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "listCaisoNodeStats error");
    res.status(500).json({ error: "internal_error", message: "Failed to list CAISO node stats" });
  }
});

// PJM Settlement Points — distinct resource node names (excludes zone/hub nodes)
const PJM_ZONE_NODES = new Set([
  "Western Hub", "Eastern Hub", "AEP-Dayton Hub", "NI Hub",
  "PSEG", "PPL", "DOM", "BGE", "PECO", "COMED", "ATSI", "PENELEC",
]);

router.get("/pjm-settlement-points", async (req, res) => {
  try {
    const rows = await db.execute<{ node: string }>(
      sql`SELECT DISTINCT node FROM pjm_node_stats ORDER BY node`
    );
    const resource = rows.rows.map(r => r.node).filter(n => !PJM_ZONE_NODES.has(n));
    res.json(resource);
  } catch (err) {
    req.log.error({ err }, "listPjmSettlementPoints error");
    res.status(500).json({ error: "internal_error", message: "Failed to list PJM settlement points" });
  }
});

// PJM Node Stats
router.get("/pjm-node-stats", async (req, res) => {
  try {
    const parsed = ListPjmNodeStatsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", message: parsed.error.message });
      return;
    }
    const { node, year, month } = parsed.data;
    const conditions = [];
    if (node) conditions.push(eq(pjmNodeStatsTable.node, node));
    if (year !== undefined) conditions.push(eq(pjmNodeStatsTable.year, year));
    if (month !== undefined) conditions.push(eq(pjmNodeStatsTable.month, month));

    const rows = await db.select().from(pjmNodeStatsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(pjmNodeStatsTable.year, pjmNodeStatsTable.month);

    res.json(rows.map(r => ({
      ...r,
      avgDaPrice: Number(r.avgDaPrice),
      avgRtPrice: r.avgRtPrice ? Number(r.avgRtPrice) : null,
      volatility: r.volatility ? Number(r.volatility) : null,
      negPricePercent: r.negPricePercent ? Number(r.negPricePercent) : null,
      onPeakAvg: r.onPeakAvg ? Number(r.onPeakAvg) : null,
      offPeakAvg: r.offPeakAvg ? Number(r.offPeakAvg) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "listPjmNodeStats error");
    res.status(500).json({ error: "internal_error", message: "Failed to list PJM node stats" });
  }
});

export default router;
