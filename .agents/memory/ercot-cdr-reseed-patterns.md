---
name: ERCOT CDR LZ/HB reseed patterns
description: Resilience patterns for seed-ercot-real.ts (POST /api/admin/reseed-ercot-nodes) seeding 15 LZ/HB nodes from CDR 13061 RTM + 13060 DAM into ercot_nodal_stats and ercot_node_stats.
---

## Rule
`seed-ercot-real.ts` seeds the 15 ERCOT LZ/HB settlement points from CDR 13061 (RTM) + 13060 (DAM) into both `ercot_nodal_stats` (congestion page) and `ercot_node_stats` (nodal analysis page).

## ERCOT CDR connection drop (EPIPE)
The ERCOT CDR server (ercot.com/misdownload) drops TCP connections after ~60 minutes of active session. This means the second HTTPS request in a session (DAM download, after ~60 min of RTM XLSX parsing) throws `EPIPE` / `ECONNRESET`.

**Fix (already in code):** `downloadBuffer()` wraps `downloadBufferOnce()` with 3 retries on EPIPE/ECONNRESET/ETIMEDOUT, 5s delay each. A fresh socket is established on retry and succeeds. Confirmed working: both 2024 and 2025 DAM downloads fired `[retry 1/3] EPIPE` and recovered.

## 2026 annual file not published mid-year
ERCOT publishes annual RTM/DAM XLSX files (RTMLZHBSPP_YYYY.xlsx, DAMLZHBSPP_YYYY.xlsx) at or after year-end. Mid-year, the CDR doclookupId returns a 105-byte XML: `<?xml version="1.0"...><root>Error Downloading Content - NO Results</root>`. `extractXlsxFromZip()` throws "No EOCD in ZIP".

**Fix (already in code):** `processYear()` catches `extractXlsxFromZip` errors and returns `false`; `main()` skips the year without crashing.

## Incremental writes
`main()` processes one year at a time (processYear → buildRows → writeYear). `writeYear()` does `DELETE WHERE year = $year` then INSERT in batches of 200. This means if 2025 fails, 2024 data is already committed and won't be lost on re-run.

## ercot_nodal_stats has no unique constraint
`ercot_nodal_stats` has only a serial PK — no unique constraint on (settlement_point, year, month). Cannot use ON CONFLICT DO UPDATE. Use DELETE WHERE year + INSERT instead (already the pattern in writeYear).

## gas_prices.ts year filter
`ercot_node_stats` has rows going back to 2022 (from resource node seeder). The `/api/gas-prices/spark-spread` and `/api/gas-prices/implied-heat-rate` endpoints join ercot_node_stats for power prices. Without `AND year >= 2024`, the power-price subquery returns 2022 rows where gas_prices are NULL, anchoring the X-axis at Jan 2022 and displaying null gaps. Filter added in both endpoints.

**Why:** gas_prices table only starts Jan 2024 (FRED DHHNGSP data seeded from 2024); joining with pre-2024 node_stats rows produces null gas prices which pollute the chart date range.

## ERCOT Gas & Power page route
The page is at `/ercot-gas` (not `/gas-power` or `/ercot/gas`). Registered as `<Route path="/ercot-gas" component={ErcotGasPage} />` in App.tsx.

## Post-seed DB state (Jul 2026)
- ercot_nodal_stats: 563 rows (2023 old synthetic + 180 real 2024 + 180 real 2025)
- ercot_node_stats: 1,364 rows (1,100 resource nodes + 264 new LZ/HB 2024+2025)
- rtCompleteness: 100% across all records
