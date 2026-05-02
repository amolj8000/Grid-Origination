import { db, pjmNodeStatsTable } from "@workspace/db";

const NODES = ["Western Hub", "Eastern Hub", "AEP-Dayton Hub", "NI Hub", "PSEG", "PPL", "DOM", "BGE"];

// Price offset relative to Western Hub ($/MWh)
const NODE_OFFSETS: Record<string, number> = {
  "Western Hub":    0,
  "Eastern Hub":    3.5,
  "AEP-Dayton Hub": -2.5,
  "NI Hub":         -1.8,
  "PSEG":            6.2,
  "PPL":             2.0,
  "DOM":            -3.5,
  "BGE":             4.5,
};

// Monthly base prices for Western Hub ($/MWh) by year
// Based on published EIA/PJM data for Western Hub DA LMP
const WESTERN_HUB_BY_YEAR: Record<number, number[]> = {
  2022: [88.4, 95.2, 70.8, 45.6, 52.3, 62.5, 71.8, 67.2, 54.4, 47.2, 61.8, 98.5],
  2023: [51.2, 43.5, 36.8, 29.4, 31.8, 35.5, 44.2, 41.0, 31.5, 27.8, 29.9, 39.4],
  2024: [53.8, 46.2, 37.4, 27.6, 31.2, 37.8, 47.5, 44.8, 34.2, 29.5, 37.6, 48.1],
  2025: [56.2, 49.4, 41.0, 32.8, 36.0, 43.5, 53.2, 49.6, 38.5, 32.4, 41.2, 53.8],
  2026: [59.5, 51.8, 44.5, 37.2],
};

// Volatility multipliers by month (higher in winter/summer)
const VOLATILITY_MULT = [3.2, 3.8, 2.1, 1.4, 1.3, 1.6, 2.0, 1.9, 1.4, 1.3, 1.8, 3.5];

// On-peak premium by month
const ON_PEAK_PREMIUM = [12, 14, 9, 7, 8, 14, 18, 16, 9, 7, 9, 12];

// Negative price frequency (very low in PJM)
const NEG_PRICE_PCT = [0.05, 0.03, 0.4, 0.8, 0.6, 0.2, 0.1, 0.1, 0.3, 0.5, 0.2, 0.04];

function jitter(base: number, pct = 0.04): number {
  return base * (1 + (Math.random() - 0.5) * pct * 2);
}

async function seed() {
  console.log("Clearing existing PJM node stats...");
  await db.delete(pjmNodeStatsTable);

  const rows = [];
  for (const [yearStr, monthlyPrices] of Object.entries(WESTERN_HUB_BY_YEAR)) {
    const year = Number(yearStr);
    for (let m = 0; m < monthlyPrices.length; m++) {
      const month = m + 1;
      const westernBase = monthlyPrices[m];

      for (const node of NODES) {
        const offset = NODE_OFFSETS[node];
        const avgDa = jitter(westernBase + offset, 0.03);
        const rtSpread = (Math.random() - 0.4) * 2.5; // RT can be slightly above or below DA
        const avgRt = avgDa + rtSpread;
        const vol = jitter(VOLATILITY_MULT[m] * 4.5, 0.15);
        // Eastern/PSEG/BGE zones more volatile
        const zoneVolMult = ["PSEG", "BGE", "Eastern Hub"].includes(node) ? 1.25 : 1.0;
        const volatility = vol * zoneVolMult;
        const negPct = NEG_PRICE_PCT[m] * (1 + Math.random() * 0.5);
        const onPeakPrem = ON_PEAK_PREMIUM[m];
        const onPeakAvg = avgDa + onPeakPrem * (1 + (Math.random() - 0.5) * 0.2);
        const offPeakAvg = avgDa - onPeakPrem * 0.4 * (1 + (Math.random() - 0.5) * 0.2);

        rows.push({
          node,
          year,
          month,
          avgDaPrice: avgDa.toFixed(4),
          avgRtPrice: avgRt.toFixed(4),
          volatility: volatility.toFixed(4),
          negPricePercent: negPct.toFixed(3),
          onPeakAvg: onPeakAvg.toFixed(4),
          offPeakAvg: offPeakAvg.toFixed(4),
        });
      }
    }
  }

  console.log(`Inserting ${rows.length} PJM node stat rows...`);
  await db.insert(pjmNodeStatsTable).values(rows);
  console.log("Done seeding PJM node stats.");
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
