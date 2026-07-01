import { Router } from "express";
import { db } from "@workspace/db";
import { candidatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// Capacity factor by asset type × market
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

// Capture ratios from real hourly ERCOT data (scoring v6) / OASIS for CAISO
const ERCOT_CAPTURE: Record<string, number> = {
  solar: 0.724, wind: 1.010, storage: 1.797, natural_gas: 1.0,
  nuclear: 0.99, hydro: 0.95, biomass: 0.99, geothermal: 1.0, coal: 0.94,
};
const CAISO_CAPTURE: Record<string, number> = {
  solar: 0.68, wind: 0.95, storage: 1.90, natural_gas: 0.98,
  nuclear: 0.95, hydro: 1.05, biomass: 0.99, geothermal: 1.0, coal: 0.94,
};
const PJM_CAPTURE: Record<string, number> = {
  solar: 0.82, wind: 0.90, storage: 1.45, natural_gas: 0.98,
  nuclear: 0.95, hydro: 1.02, biomass: 0.99, geothermal: 1.0, coal: 0.94,
};

// Market DA reference prices ($/MWh, 2024 avg from real data)
const MARKET_REF_DA: Record<string, number> = {
  ERCOT: 31.42, CAISO: 33.25, PJM: 38.50,
};

// REC market base prices $/MWh (conservative: ERCOT TRECs low; PJM generic, not state SRECs)
const REC_BASE_MWH: Record<string, number> = {
  ERCOT: 2.0, CAISO: 7.0, PJM: 5.5,
};

function getCaptureRatio(assetType: string, market: string): number {
  if (market === "ERCOT") return ERCOT_CAPTURE[assetType] ?? 0.90;
  if (market === "CAISO") return CAISO_CAPTURE[assetType] ?? 0.90;
  return PJM_CAPTURE[assetType] ?? 0.90;
}

/**
 * Convert all ranking dimension scores into financial adjustments.
 * All scores are 0–100 (higher = better / lower risk).
 *
 * Returns defaults that can be overridden by caller query params.
 */
function scoreToRiskDefaults(scores: {
  locationScore:       number;  // basis risk     → basisAdjMwh
  curtailmentScore:    number;  // curtailment    → curtailmentHaircut
  gridStabilityScore:  number;  // shape/timing   → shapeDiscount
  interconnectionScore: number; // transmission   → availabilityFactor (joint w/ devRisk)
  developmentRiskScore: number; // interconnect   → availabilityFactor (joint w/ interconnect)
  environmentalScore:  number;  // REC value      → recRevenueMwh
  financialScore:      number;  // mkt revenue    → P10/P90 spread width
  market:              string;
}) {
  const {
    locationScore, curtailmentScore, gridStabilityScore,
    interconnectionScore, developmentRiskScore, environmentalScore,
    financialScore, market,
  } = scores;

  // Basis: locationScore 100 → +$6/MWh, 50 → $0, 0 → -$12/MWh (asymmetric downside)
  const basisAdjMwh = locationScore >= 50
    ? ((locationScore - 50) / 50) * 6
    : ((locationScore - 50) / 50) * 12;

  // Curtailment volume haircut: score 100 → 0%, score 0 → 22%
  const curtailmentHaircut = Math.max(0, Math.min(0.25, (100 - curtailmentScore) / 100 * 0.22));

  // Shape/timing discount on price: score 100 → 0%, score 0 → 15%
  const shapeDiscount = Math.max(0, Math.min(0.20, (100 - gridStabilityScore) / 100 * 0.15));

  // Availability: combined reliability from interconnection + development risk
  // score=100 → 99% uptime, score=50 → 96%, score=0 → 93%
  const avgReliability = (interconnectionScore + developmentRiskScore) / 2;
  const availabilityFactor = 0.93 + (avgReliability / 100) * 0.06;

  // REC revenue: market base × (environmentalScore / 100)
  // ERCOT $0–2, CAISO $0–7, PJM $0–5.5
  const recRevenueMwh = (REC_BASE_MWH[market] ?? 4) * (environmentalScore / 100);

  // Market price uncertainty band from financialScore
  // financialScore 100 = tight market (reliable revenue) → ±15% spread
  // financialScore 0   = volatile market                 → ±25% spread
  const spreadHalf = 0.15 + (1 - financialScore / 100) * 0.10;
  const p10Multiplier = 1 + spreadHalf;
  const p90Multiplier = 1 - spreadHalf;

  return {
    basisAdjMwh:       Math.round(basisAdjMwh * 100) / 100,
    curtailmentHaircut: Math.round(curtailmentHaircut * 1000) / 1000,
    shapeDiscount:      Math.round(shapeDiscount * 1000) / 1000,
    availabilityFactor: Math.round(availabilityFactor * 1000) / 1000,
    recRevenueMwh:      Math.round(recRevenueMwh * 100) / 100,
    p10Multiplier:      Math.round(p10Multiplier * 1000) / 1000,
    p90Multiplier:      Math.round(p90Multiplier * 1000) / 1000,
  };
}

function npv(cashflows: number[], wacc: number): number {
  return cashflows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + wacc, t + 1), 0);
}

/**
 * GET /api/ppa-npv
 *
 * Compute VPPA NPV incorporating all 8 ranking dimension scores as financial adjustments.
 *
 * All 5 risk adjustments have score-derived defaults but accept caller overrides:
 *   basisAdjMwh        → locationScore (node-hub spread)
 *   curtailmentHaircut → curtailmentScore (volume lost to curtailment)
 *   shapeDiscount      → gridStabilityScore (price discount from shape mismatch)
 *   availabilityFactor → interconnectionScore + developmentRiskScore (plant uptime)
 *   recRevenueMwh      → environmentalScore + market ($/MWh bundled REC value)
 *
 * P10/P90 spread auto-derived from financialScore (market revenue certainty).
 * demandProximityScore and regulatoryScore are returned as context only.
 */
router.get("/ppa-npv", async (req, res) => {
  try {
    const candidateId = Number(req.query.candidateId);
    if (!candidateId || isNaN(candidateId)) {
      res.status(400).json({ error: "bad_request", message: "candidateId required" });
      return;
    }

    const strike     = Number(req.query.strike ?? 35);
    const term       = Math.min(30, Math.max(1, Number(req.query.term ?? 15)));
    const wacc       = Math.max(0.01, Math.min(0.20, Number(req.query.wacc ?? 0.08)));
    const escalation = Math.max(0, Math.min(0.10, Number(req.query.escalation ?? 0.015)));

    const [cand] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId));
    if (!cand) {
      res.status(404).json({ error: "not_found", message: "Candidate not found" });
      return;
    }

    const assetType  = cand.assetType;
    const market     = cand.market;
    const capacityMw = Number(cand.capacityMw);
    const cf         = CF[assetType]?.[market] ?? 0.30;
    const captureRatio = getCaptureRatio(assetType, market);

    // Read all scoring dimensions
    const locationScore       = cand.locationScore       ? Number(cand.locationScore)       : 50;
    const curtailmentScoreN   = cand.curtailmentScore    ? Number(cand.curtailmentScore)    : 50;
    const gridStabilityN      = cand.gridStabilityScore  ? Number(cand.gridStabilityScore)  : 50;
    const interconnectionN    = cand.interconnectionScore ? Number(cand.interconnectionScore) : 50;
    const developmentRiskN    = cand.developmentRiskScore ? Number(cand.developmentRiskScore) : 50;
    const environmentalN      = cand.environmentalScore  ? Number(cand.environmentalScore)  : 50;
    const financialN          = cand.financialScore      ? Number(cand.financialScore)      : 50;
    const demandProximityN    = cand.demandProximityScore ? Number(cand.demandProximityScore) : 50;
    const regulatoryN         = cand.regulatoryScore     ? Number(cand.regulatoryScore)     : 50;

    const defaults = scoreToRiskDefaults({
      locationScore, curtailmentScore: curtailmentScoreN, gridStabilityScore: gridStabilityN,
      interconnectionScore: interconnectionN, developmentRiskScore: developmentRiskN,
      environmentalScore: environmentalN, financialScore: financialN, market,
    });

    // Accept caller overrides or fall back to score-derived defaults
    const basisAdjMwh      = req.query.basisAdjMwh       !== undefined ? Number(req.query.basisAdjMwh)       : defaults.basisAdjMwh;
    const curtailmentHaircut = req.query.curtailmentHaircut !== undefined ? Math.max(0, Math.min(0.25, Number(req.query.curtailmentHaircut))) : defaults.curtailmentHaircut;
    const shapeDiscount    = req.query.shapeDiscount      !== undefined ? Math.max(0, Math.min(0.20, Number(req.query.shapeDiscount)))      : defaults.shapeDiscount;
    const availabilityFactor = req.query.availabilityFactor !== undefined ? Math.max(0.80, Math.min(1.0, Number(req.query.availabilityFactor))) : defaults.availabilityFactor;
    const recRevenueMwh    = req.query.recRevenueMwh      !== undefined ? Math.max(0, Math.min(30, Number(req.query.recRevenueMwh)))         : defaults.recRevenueMwh;

    // Use P10/P90 spread from financialScore (not overridable — auto from model)
    const p10Multiplier = defaults.p10Multiplier;
    const p90Multiplier = defaults.p90Multiplier;

    // Price build-up:
    //   marketRefDA × captureRatio  → raw capture
    //   × (1 - shapeDiscount)       → timing penalty
    //   + basisAdjMwh               → node-hub spread
    //   + recRevenueMwh             → bundled REC value (additional $/MWh revenue)
    const marketRefDA       = MARKET_REF_DA[market] ?? 31.42;
    const rawCapturePrice   = marketRefDA * captureRatio;
    const afterShapePrice   = rawCapturePrice * (1 - shapeDiscount);
    const afterBasisPrice   = afterShapePrice + basisAdjMwh;
    const effectiveCapturePrice = afterBasisPrice;  // pre-REC power price
    const totalRevenueMwh   = effectiveCapturePrice + recRevenueMwh;  // power + REC

    // Volume: gross → curtailment → availability
    const grossMwhYr = Number(req.query.volume) > 0
      ? Number(req.query.volume)
      : capacityMw * cf * 8760;
    const afterCurtailmentMwh = grossMwhYr * (1 - curtailmentHaircut);
    const effectiveMwhYr = afterCurtailmentMwh * availabilityFactor;

    function buildScenarioCashflows(priceMultiplier: number): number[] {
      const cashflows: number[] = [];
      for (let t = 0; t < term; t++) {
        const marketRevMwh = totalRevenueMwh * priceMultiplier * Math.pow(1 + escalation, t);
        cashflows.push((marketRevMwh - strike) * effectiveMwhYr);
      }
      return cashflows;
    }

    const p50Flows = buildScenarioCashflows(1.00);
    const p10Flows = buildScenarioCashflows(p10Multiplier);
    const p90Flows = buildScenarioCashflows(p90Multiplier);

    const p50Npv = npv(p50Flows, wacc);
    const p10Npv = npv(p10Flows, wacc);
    const p90Npv = npv(p90Flows, wacc);

    // Breakeven: the market price at which NPV(P50) = 0
    const breakevenPower = (() => {
      let lo = 0, hi = 300;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const flows = Array.from({ length: term }, (_, t) =>
          ((mid + recRevenueMwh) * Math.pow(1 + escalation, t) - strike) * effectiveMwhYr
        );
        if (npv(flows, wacc) < 0) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    })();

    res.json({
      candidateId,
      candidateName:    cand.name,
      assetType,
      market,
      capacityMw,
      grossMwhYr:       Math.round(grossMwhYr),
      contractedMwhYr:  Math.round(effectiveMwhYr),
      inputs: { strike, term, wacc, escalation },

      // Full price waterfall
      priceWaterfall: {
        marketRefDa:        Math.round(marketRefDA * 100) / 100,
        captureRatio:       Math.round(captureRatio * 1000) / 1000,
        rawCapturePrice:    Math.round(rawCapturePrice * 100) / 100,
        shapeDiscount:      Math.round(shapeDiscount * 1000) / 1000,
        afterShapePrice:    Math.round(afterShapePrice * 100) / 100,
        basisAdjMwh:        Math.round(basisAdjMwh * 100) / 100,
        powerCapturePrice:  Math.round(effectiveCapturePrice * 100) / 100,
        recRevenueMwh:      Math.round(recRevenueMwh * 100) / 100,
        totalRevenueMwh:    Math.round(totalRevenueMwh * 100) / 100,
      },

      // Volume waterfall
      volumeWaterfall: {
        grossMwhYr:           Math.round(grossMwhYr),
        curtailmentHaircut:   Math.round(curtailmentHaircut * 1000) / 1000,
        curtailmentLossMwhYr: Math.round(grossMwhYr * curtailmentHaircut),
        afterCurtailmentMwh:  Math.round(afterCurtailmentMwh),
        availabilityFactor:   Math.round(availabilityFactor * 1000) / 1000,
        availabilityLossMwhYr: Math.round(afterCurtailmentMwh * (1 - availabilityFactor)),
        deliveredMwhYr:       Math.round(effectiveMwhYr),
      },

      // All score dimensions used in model + context
      riskFactors: {
        // Sliders
        locationScore, curtailmentScore: curtailmentScoreN, gridStabilityScore: gridStabilityN,
        interconnectionScore: interconnectionN, developmentRiskScore: developmentRiskN,
        environmentalScore: environmentalN,
        // Context only
        financialScore: financialN, demandProximityScore: demandProximityN, regulatoryScore: regulatoryN,
        // Applied values
        basisAdjMwh:         Math.round(basisAdjMwh * 100) / 100,
        curtailmentHaircut:  Math.round(curtailmentHaircut * 1000) / 1000,
        shapeDiscount:       Math.round(shapeDiscount * 1000) / 1000,
        availabilityFactor:  Math.round(availabilityFactor * 1000) / 1000,
        recRevenueMwh:       Math.round(recRevenueMwh * 100) / 100,
        p10Multiplier:       Math.round(p10Multiplier * 1000) / 1000,
        p90Multiplier:       Math.round(p90Multiplier * 1000) / 1000,
      },

      baseCapturePriceMwh: Math.round(totalRevenueMwh * 100) / 100, // kept for compat
      scenarios: {
        p10: {
          label: `Bullish (+${Math.round((p10Multiplier - 1) * 100)}% power price)`,
          priceMultiplier: p10Multiplier,
          npvM: Math.round(p10Npv / 1e6 * 10) / 10,
          avgAnnualCashflowM: Math.round(npv(p10Flows, 0) / term / 1e6 * 10) / 10,
        },
        p50: {
          label: "Base (current market)",
          priceMultiplier: 1.00,
          npvM: Math.round(p50Npv / 1e6 * 10) / 10,
          avgAnnualCashflowM: Math.round(npv(p50Flows, 0) / term / 1e6 * 10) / 10,
        },
        p90: {
          label: `Bearish (${Math.round((p90Multiplier - 1) * 100)}% power price)`,
          priceMultiplier: p90Multiplier,
          npvM: Math.round(p90Npv / 1e6 * 10) / 10,
          avgAnnualCashflowM: Math.round(npv(p90Flows, 0) / term / 1e6 * 10) / 10,
        },
      },
      breakevenPriceMwh: Math.round(breakevenPower * 100) / 100,
      annualCashflowsP50M: p50Flows.map((v, t) => ({
        year:          t + 1,
        cashflowM:     Math.round(v / 1e6 * 10) / 10,
        marketPriceMwh: Math.round(totalRevenueMwh * Math.pow(1 + escalation, t) * 100) / 100,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "ppa-npv error");
    res.status(500).json({ error: "internal_error", message: "Failed to compute PPA NPV" });
  }
});

export default router;
