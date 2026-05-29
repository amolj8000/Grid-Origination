---
name: ERCOT curtailment scoring
description: How curtailment_score is computed for ERCOT candidates — zone mapping, data sources, and refresh flow.
---

## Rule
ERCOT candidate curtailment_score is computed by `scripts/src/score-ercot-curtailment.ts` using:
1. **Load zone mapping** by lat/lon bounding box: LZ_WEST (lon < -99.5), LZ_NORTH (lat≥31.5, lon -98.5 to -96), LZ_HOUSTON (lon≥-96), LZ_SOUTH (everything else)
2. **Zone DA-RT spread** from real `ercot_node_stats` hub/zone nodes (2024-2026, 28 months)
3. **Asset-type multipliers**: wind/solar in LZ_WEST → lowest scores (~65), gas/nuclear → highest (~94-98)
4. **Fleet neg_price_percent** from CDR 12301 resource nodes (Apr-May 2026, fleet avg 6.42%) as a baseline penalty

`pricing_hub_node` is written with the mapped load zone (e.g., "LZ_WEST") for each ERCOT candidate.
`overall_score` is recomputed via SQL UPDATE after running the script.

**Why:** All 787 ERCOT candidates had flat curtailment_score=52.00; no interconnection_node or pricing_hub_node was set from EIA 860 seeder. Zone mapping by lat/lon is the best available approach given missing node mappings.

**How to apply:** After new CDR 12301 data is seeded (`pnpm --filter @workspace/scripts run seed-ercot-nodes-cdr`), re-run `pnpm --filter @workspace/scripts run score-ercot-curtailment` then recompute overall_score via SQL UPDATE (see route candidates.ts weights).

## Score ranges (as of May 2026)
| Zone | Wind | Solar | Storage | Gas |
|------|------|-------|---------|-----|
| LZ_WEST | 64.6 | 67.4 | 80.0 | 88.4 |
| LZ_SOUTH | 82.2 | 79.5 | 88.5 | 93.9 |
| LZ_NORTH | 83.8 | 85.2 | 90.1 | 94.3 |
| LZ_HOUSTON | 98.0 | 98.0 | 98.0 | 98.0 |
