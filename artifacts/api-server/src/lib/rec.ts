/**
 * Renewable Energy Credit (REC) computation utilities.
 *
 * Methodology:
 *   Annual RECs (MWh) = capacity_mw × capacity_factor × 8,760 h
 *   Annual value ($)  = annual_mwh × rec_price_per_mwh
 *
 * Capacity factors: EIA / ISO annual reports (2024 averages).
 *
 * REC benchmark prices (2024):
 *   ERCOT → Texas Renewable Energy Credits (TRCs): $1.00–2.00/MWh by fuel type
 *   CAISO → CA WREGIS RPS compliance RECs: $6–13/MWh by fuel type
 *   PJM   → State-specific: SRECs (solar), ORECs (offshore), Class I/II RECs (wind/other)
 *            Sources: PJM GATS, state PUC filings, SREC Trade (2024)
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

// ERCOT TRC prices by fuel type ($/MWh) — Texas Renewable Energy Credits
// Wind dominates TRC supply → lower price; solar slightly scarcer → premium
const ERCOT_PRICES: Record<string, number> = {
  solar:         2.00,
  wind:          1.00,
  offshore_wind: 1.00,
  hydro:         1.25,
  geothermal:    1.25,
  biomass:       1.25,
  hybrid:        2.00,
  solar_storage: 2.00,
  wind_storage:  1.00,
};

// CAISO WREGIS RPS prices by fuel type ($/MWh)
// Solar has highest demand from CA utilities; geothermal valued for baseload
const CAISO_PRICES: Record<string, number> = {
  solar:         13.00,
  wind:           8.00,
  offshore_wind:  8.00,
  hydro:          6.00,
  geothermal:    10.00,
  biomass:        6.00,
  hybrid:        13.00,
  solar_storage: 13.00,
  wind_storage:   8.00,
};

// PJM solar SREC prices by state ($/MWh) — from PJM GATS / state PUC data (2024)
// DC, NJ, IL, MD, PA have active SREC markets; others have generic Class I RECs
export const PJM_SOLAR_SREC_BY_STATE: Record<string, number> = {
  DC: 430,  // DC SRECs — solar Tier 1 carve-out, very limited supply; DOEE (2024)
  NJ: 185,  // NJ SRECs — active spot market; NJBPU (2024)
  IL:  80,  // IL Shines ADRECs — adjusted delivery payments; IPA (2024)
  MD:  75,  // MD SREC II — MEA data (2024)
  PA:  45,  // PA SRECs — AEPS Act; SREC Trade (2024)
  DE:  20,  // DE SRECs — DESRP; DPUC (2024)
  VA:   5,  // VA — VCEA, bundled REC only, no solar carve-out
  NC:   3,  // NC REPS — modest solar REC premium
  OH:   2,  // OH — limited RPS after 2014 freeze
  IN:   2,  // IN — voluntary market
  WV:   1,  // WV — minimal RPS
  KY: 0.75, // KY — no RPS mandate
  MI:   2,  // MI — PSCR program
  MN:   4,  // MN — MSIA NextGen program
  TN:   1,  // TN — no state RPS
};

// PJM non-solar REC prices by state ($/MWh) — Class I wind / hydro / biomass
export const PJM_NONSOLAR_REC_BY_STATE: Record<string, number> = {
  DC:   8,
  NJ:   7,  // NJ Class I REC
  IL:   2,
  MD:   6,
  PA:   8,  // PA AEPS Tier I
  DE:   5,
  VA:   5,
  NC:   3,
  OH: 1.5,
  IN:   2,
  WV:   1,
  KY: 0.75,
  MI:   2,
  MN:   4,
  TN:   1,
};

// Offshore OREC by state ($/MWh) — state-specific offshore programs
const PJM_OFFSHORE_OREC_BY_STATE: Record<string, number> = {
  NJ: 120,  // NJ OREC program
  MD: 132,  // MD OREC (2024 auction)
  VA:  80,  // VA offshore (Coastal Virginia program)
};

// REC market program label by state (for display)
export function getPjmRecLabel(assetType: string, state: string): string {
  const t = assetType.toLowerCase();
  if (t === "offshore_wind") {
    return state in PJM_OFFSHORE_OREC_BY_STATE ? `${state} OREC` : "PJM Class I REC";
  }
  if (t === "solar" || t === "solar_storage" || t === "hybrid") {
    const hasActiveSrec = ["DC","NJ","IL","MD","PA","DE"].includes(state);
    if (state === "DC") return "DC SREC (Tier 1)";
    if (state === "IL") return "IL Shines ADEC";
    if (hasActiveSrec) return `${state} SREC`;
    return `${state} Class I REC`;
  }
  return `${state} Class I REC`;
}

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

export function computeRec(assetType: string, market: string, capacityMw: number, state?: string): RecData {
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

  const cf = CAPACITY_FACTORS[t]?.[market] ?? 0.30;
  const genRatio = t === "hybrid" ? 0.60 : 1.0;

  let price: number;
  let recMarketLabel: string;

  if (market === "ERCOT") {
    price = ERCOT_PRICES[t] ?? 1.25;
    recMarketLabel = "Texas TRC";
  } else if (market === "CAISO") {
    price = CAISO_PRICES[t] ?? 7.00;
    recMarketLabel = "CA WREGIS RPS";
  } else {
    // PJM — state-specific
    const st = (state ?? "").toUpperCase();
    if (t === "offshore_wind") {
      price = PJM_OFFSHORE_OREC_BY_STATE[st] ?? 120;
    } else if (t === "solar" || t === "solar_storage" || t === "hybrid") {
      price = PJM_SOLAR_SREC_BY_STATE[st] ?? 5;
    } else {
      price = PJM_NONSOLAR_REC_BY_STATE[st] ?? 3;
    }
    recMarketLabel = st ? getPjmRecLabel(t, st) : "PJM REC";
  }

  const annualRecMwh      = Math.round(capacityMw * cf * 8760 * genRatio);
  const annualRecValueUsd = Math.round(annualRecMwh * price);

  return {
    recEligible: true,
    annualRecMwh,
    recPricePerMwh: price,
    annualRecValueUsd,
    lifetimeRecValue20yr: annualRecValueUsd * 20,
    recMarketLabel,
  };
}
