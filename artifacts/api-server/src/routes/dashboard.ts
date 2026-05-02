import { Router } from "express";
import { db, candidatesTable, screeningsTable, queueProjectsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { GetTopCandidatesQueryParams } from "@workspace/api-zod";

const router = Router();

const OBJECTIVE_WEIGHTS: Record<string, Record<string, number>> = {
  lowest_lcoe: { priceScore: 0.3, financialScore: 0.25, interconnectionScore: 0.15, locationScore: 0.1, curtailmentScore: 0.1, regulatoryScore: 0.05, environmentalScore: 0.02, gridStabilityScore: 0.01, demandProximityScore: 0.01, developmentRiskScore: 0.01 },
  risk_adjusted_value: { priceScore: 0.2, financialScore: 0.15, regulatoryScore: 0.15, developmentRiskScore: 0.15, interconnectionScore: 0.1, curtailmentScore: 0.1, locationScore: 0.05, gridStabilityScore: 0.05, environmentalScore: 0.03, demandProximityScore: 0.02 },
  load_hedge: { demandProximityScore: 0.25, gridStabilityScore: 0.2, locationScore: 0.15, priceScore: 0.15, interconnectionScore: 0.1, curtailmentScore: 0.05, regulatoryScore: 0.05, financialScore: 0.03, environmentalScore: 0.01, developmentRiskScore: 0.01 },
  decarbonization: { environmentalScore: 0.3, curtailmentScore: 0.2, gridStabilityScore: 0.15, locationScore: 0.1, regulatoryScore: 0.1, priceScore: 0.05, interconnectionScore: 0.05, demandProximityScore: 0.03, financialScore: 0.01, developmentRiskScore: 0.01 },
};

router.get("/dashboard/summary", async (req, res) => {
  try {
    const [candidateStats] = await db.select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where status = 'active')::int`,
      totalCapacity: sql<number>`coalesce(sum(capacity_mw::numeric), 0)`,
      avgScore: sql<number>`coalesce(avg(overall_score::numeric), 0)`,
    }).from(candidatesTable);

    const [screeningCount] = await db.select({
      total: sql<number>`count(*)::int`,
    }).from(screeningsTable);

    const [queueCount] = await db.select({
      total: sql<number>`count(*)::int`,
    }).from(queueProjectsTable);

    const byMarket = await db.select({
      market: candidatesTable.market,
      count: sql<number>`count(*)::int`,
    }).from(candidatesTable).groupBy(candidatesTable.market);

    const byAssetType = await db.select({
      assetType: candidatesTable.assetType,
      count: sql<number>`count(*)::int`,
    }).from(candidatesTable).groupBy(candidatesTable.assetType);

    res.json({
      totalCandidates: candidateStats.total,
      activeCandidates: candidateStats.active,
      totalCapacityMw: Number(candidateStats.totalCapacity),
      avgOverallScore: Math.round(Number(candidateStats.avgScore) * 10) / 10,
      totalScreenings: screeningCount.total,
      candidatesByMarket: Object.fromEntries(byMarket.map(r => [r.market, r.count])),
      candidatesByAssetType: Object.fromEntries(byAssetType.map(r => [r.assetType, r.count])),
      queueProjectCount: queueCount.total,
    });
  } catch (err) {
    req.log.error({ err }, "getDashboardSummary error");
    res.status(500).json({ error: "internal_error", message: "Failed to get dashboard summary" });
  }
});

router.get("/dashboard/market-breakdown", async (req, res) => {
  try {
    const rows = await db.select({
      market: candidatesTable.market,
      assetType: candidatesTable.assetType,
      count: sql<number>`count(*)::int`,
      avgScore: sql<number>`coalesce(avg(overall_score::numeric), 0)`,
      totalCapacity: sql<number>`coalesce(sum(capacity_mw::numeric), 0)`,
    }).from(candidatesTable).groupBy(candidatesTable.market, candidatesTable.assetType);

    res.json(rows.map(r => ({
      market: r.market,
      assetType: r.assetType,
      count: r.count,
      avgScore: Math.round(Number(r.avgScore) * 10) / 10,
      totalCapacityMw: Number(r.totalCapacity),
    })));
  } catch (err) {
    req.log.error({ err }, "getMarketBreakdown error");
    res.status(500).json({ error: "internal_error", message: "Failed to get market breakdown" });
  }
});

router.get("/dashboard/top-candidates", async (req, res) => {
  try {
    const parsed = GetTopCandidatesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", message: parsed.error.message });
      return;
    }
    const { limit = 10 } = parsed.data;

    const rows = await db.select().from(candidatesTable)
      .orderBy(desc(sql`overall_score::numeric`))
      .limit(limit);

    res.json(rows.map(r => ({
      ...r,
      capacityMw: Number(r.capacityMw),
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      overallScore: Number(r.overallScore),
      estimatedLcoe: r.estimatedLcoe ? Number(r.estimatedLcoe) : null,
      offtakePriceMwh: r.offtakePriceMwh ? Number(r.offtakePriceMwh) : null,
      priceScore: r.priceScore ? Number(r.priceScore) : null,
      locationScore: r.locationScore ? Number(r.locationScore) : null,
      curtailmentScore: r.curtailmentScore ? Number(r.curtailmentScore) : null,
      interconnectionScore: r.interconnectionScore ? Number(r.interconnectionScore) : null,
      regulatoryScore: r.regulatoryScore ? Number(r.regulatoryScore) : null,
      financialScore: r.financialScore ? Number(r.financialScore) : null,
      environmentalScore: r.environmentalScore ? Number(r.environmentalScore) : null,
      gridStabilityScore: r.gridStabilityScore ? Number(r.gridStabilityScore) : null,
      demandProximityScore: r.demandProximityScore ? Number(r.demandProximityScore) : null,
      developmentRiskScore: r.developmentRiskScore ? Number(r.developmentRiskScore) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "getTopCandidates error");
    res.status(500).json({ error: "internal_error", message: "Failed to get top candidates" });
  }
});

router.get("/dashboard/queue-summary", async (req, res) => {
  try {
    const byFuelType = await db.select({
      fuelType: queueProjectsTable.fuelType,
      count: sql<number>`count(*)::int`,
      totalCapacity: sql<number>`coalesce(sum(capacity_mw::numeric), 0)`,
    }).from(queueProjectsTable).groupBy(queueProjectsTable.fuelType);

    const byStatus = await db.select({
      status: queueProjectsTable.status,
      count: sql<number>`count(*)::int`,
    }).from(queueProjectsTable).groupBy(queueProjectsTable.status);

    const byMarket = await db.select({
      market: queueProjectsTable.market,
      count: sql<number>`count(*)::int`,
      totalCapacity: sql<number>`coalesce(sum(capacity_mw::numeric), 0)`,
    }).from(queueProjectsTable).groupBy(queueProjectsTable.market);

    res.json({
      byFuelType: byFuelType.map(r => ({ fuelType: r.fuelType, count: r.count, totalCapacityMw: Number(r.totalCapacity) })),
      byStatus: byStatus.map(r => ({ status: r.status, count: r.count })),
      byMarket: byMarket.map(r => ({ market: r.market, count: r.count, totalCapacityMw: Number(r.totalCapacity) })),
    });
  } catch (err) {
    req.log.error({ err }, "getQueueSummary error");
    res.status(500).json({ error: "internal_error", message: "Failed to get queue summary" });
  }
});

export default router;
