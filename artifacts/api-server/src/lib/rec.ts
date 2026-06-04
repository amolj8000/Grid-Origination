/**
 * Renewable Energy Credit (REC) computation utilities.
 *
 * Methodology:
 *   Annual RECs (MWh) = capacity_mw × capacity_factor × 8,760 h
 *   Annual value ($)  = annual_mwh × rec_price_per_mwh
 *
 * Capacity factors sourced from EIA / ISO annual reports (2024 averages).
 * REC benchmark prices (2024):
 *   ERCOT → Texas Renewable Energy Credits (TRCs): ~$1.50/MWh — large, liquid, cheap
 *   CAISO → CA WREGIS RPS compliance RECs: $7–$12/MWh depending on technology
 *   PJM   → Varies widely by state RPS; solar SRECs can reach $15+, offshore ORECs ~$120/MWh
 */

const CAPACITY_FACTORS: Record<string, Record<string, number>> = {
  solar:        { ERCOT: 0.27, CAISO: 0.29, PJM: 0.22 },
  wind:         { ERCOT: 0.40, CAISO: 0.32, PJM: 0.35 },
  offshore_wind:{ ERCOT: 0.42, CAISO: 0.42, PJM: 0.45 },
  hydro:        { ERCOT: 0.40, CAISO: 0.42, PJM: 0.38 },
  geothermal:   { ERCOT: 0.88, CAISO: 0.88, PJM: 0.88 },
  biomass:      { ERCOT: 0.65, CAISO: 0.65, PJM: 0.65 },
  hybrid:       { ERCOT: 0.27, CAISO: 0.29, PJM: 0.22 },
  solar_storage:{ ERCOT: 0.27, CAISO: 0.29, PJM: 0.22 },
  wind_storage: { ERCOT: 0.40, CAISO: 0.32, PJM: 0.35 },
};

const REC_PRICES: Record<string, Record<string, number>> = {
  solar:        { ERCOT: 1.50, CAISO: 12.00, PJM: 15.00 },
  wind:         { ERCOT: 1.50, CAISO: 10.00, PJM:  3.50 },
  offshore_wind:{ ERCOT: 1.50, CAISO: 10.00, PJM: 120.00 },
  hydro:        { ERCOT: 1.50, CAISO:  7.00, PJM:  2.00 },
  geothermal:   { ERCOT: 1.50, CAISO: 10.00, PJM:  5.00 },
  biomass:      { ERCOT: 1.50, CAISO:  8.00, PJM:  3.00 },
  hybrid:       { ERCOT: 1.50, CAISO: 12.00, PJM: 15.00 },
  solar_storage:{ ERCOT: 1.50, CAISO: 12.00, PJM: 15.00 },
  wind_storage: { ERCOT: 1.50, CAISO: 10.00, PJM:  3.50 },
};

const REC_MARKET_LABEL: Record<string, string> = {
  ERCOT: "Texas TRC",
  CAISO: "CA WREGIS RPS",
  PJM:   "PJM REC / SREC",
};

const REC_ELIGIBLE = new Set([
  "solar", "wind", "offshore_wind", "hydro",
  "geothermal", "biomass", "hybrid", "solar_storage", "wind_storage",
]);

export interface RecData {
  recEligible: boolean;
  annualRecMwh: number;
  recPricePerMwh: number;
  annualRecValueUsd: number;
  lifetimeRecValue20yr: number;
  recMarketLabel: string;
}

export function computeRec(assetType: string, market: string, capacityMw: number): RecData {
  const t = (assetType ?? "").toLowerCase();
  const eligible = REC_ELIGIBLE.has(t);

  if (!eligible || capacityMw <= 0) {
    return {
      recEligible: false,
      annualRecMwh: 0,
      recPricePerMwh: 0,
      annualRecValueUsd: 0,
      lifetimeRecValue20yr: 0,
      recMarketLabel: "",
    };
  }

  const cf    = CAPACITY_FACTORS[t]?.[market] ?? 0.30;
  const price = REC_PRICES[t]?.[market]       ?? 2.00;
  const genRatio = t === "hybrid" ? 0.60 : 1.0;

  const annualRecMwh     = Math.round(capacityMw * cf * 8760 * genRatio);
  const annualRecValueUsd = Math.round(annualRecMwh * price);

  return {
    recEligible: true,
    annualRecMwh,
    recPricePerMwh: price,
    annualRecValueUsd,
    lifetimeRecValue20yr: annualRecValueUsd * 20,
    recMarketLabel: REC_MARKET_LABEL[market] ?? market,
  };
}
