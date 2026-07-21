---
name: ERCOT SCED Hourly Dispatch
description: Real dispatch data from NP3-965-ER SCED 60-day disclosure — seeding pattern, schema, and API endpoints.
---

## What it is
Real ERCOT SCED (Security Constrained Economic Dispatch) data from the NP3-965-ER 60-day public disclosure.
Covers all ~1,215 generation resources in ERCOT with 5-minute dispatch intervals aggregated to hourly.

## Source & auth
- Report: ERCOT Public API — `np3-965-er` archive endpoint
- Auth: Bearer token via ERCOT B2C ROPC flow (ERCOT_CLIENT_ID, ERCOT_USERNAME, ERCOT_PASSWORD, ERCOT_SUBSCRIPTION_KEY)
- CDR misdownload requires NO auth: `https://www.ercot.com/misdownload/servlets/mirDownload?mimic_duns=000000000&doclookupId=<id>`

## ERCOT Archive API quirks (critical)
- Archive listing URL: `https://api.ercot.com/api/public-reports/archive/np3-965-er`
- Response key is `archives` NOT `data` (gridstatus source confirmed)
- docId lives in `archive["_links"]["endpoint"]["href"]` — a CDR misdownload URL ending in `doclookupId=XXXXXXX`
- `postDatetime` field is the ERCOT posting timestamp (~60 days after operational date)
- ERCOT posts archives **59–62 days** after operational date (not exactly 60) — use a [+58, +63] window
- When using a wide window, always verify: `abs((post_dt - expected_post).days) <= 3` to avoid picking up a neighboring date's archive for genuinely-missing days
- Some operational dates have no archive at all (e.g. 2026-03-04) — this is a genuine ERCOT gap, not a seeder bug

## Seeder: seed_month_v2.py (fast CDR+Polars approach)
- Location: `artifacts/pypsa-engine/seed_month_v2.py`
- Usage: `.venv/bin/python seed_month_v2.py <YEAR> <MONTH>`
- Each day: 1 listing API call (with 2s sleep) + CDR download (~53MB ZIP) + polars parse + psycopg2 insert
- ~20s per day; 30 days ≈ ~10 minutes per month
- Polars requires `infer_schema_length=0` for the wide SCED CSV schema
- `_get_month_doc_ids` batch approach returns empty because it was reading `data` key — use per-day `_get_doc_id` instead
- Token refresh every 50 min (ERCOT tokens expire at ~60 min)

## Why CDR+Polars vs gridstatus
- gridstatus `get_60_day_sced_disclosure` hangs indefinitely on internal pandas processing for large dates
- CDR misdownload (no auth) + polars is 317K rows in 2.1s vs gridstatus hanging for hours
- Per-day listing calls with 2s sleep prevent HTTP 429 rate limiting

## DB tables
- `ercot_hourly_dispatch` — PRIMARY KEY (resource_name, hour); stores avg/max MW, HSL, LSL, base_point, online_intervals, offer_price_min/max, offer_mw_total, startup_cold/hot; NO seed_date column
- `ercot_dispatch_seed_log` — one row per operational date (ON CONFLICT seed_date); use for gap-fill (skip already-seeded days)

## Data status
- Jan 2024 – May 2026: ~26M rows across 29 months
- December 2025: only 4 days seeded (existing gap)
- May 2026: 21 days (embargoed — 60-day lag means June 2026 available ~late August 2026)

## Admin endpoints (api-server)
- `GET /api/ercot/dispatch/seed-status` — row counts, resources, date range
- `GET /api/ercot/dispatch/dates` — list of seeded operational dates
- `GET /api/ercot/dispatch/supply-stack?date=YYYY-MM-DD` — merit order for one day
- `GET /api/ercot/dispatch/summary?months=N` — monthly generation by fuel type
- `GET /api/ercot/dispatch/capacity-factors?granularity=alltime|monthly` — CF by fuel type

## Frontend
- Page: `artifacts/grid-platform/src/pages/ercot-dispatch.tsx`
- Route: `/ercot-dispatch`
- Nav: "ERCOT Dispatch / SCED" in sidebar

## Observed reality (Jan 2024 baseline)
- Nuclear: 99% CF, -$211 avg offer (must-run self-schedule)
- Wind: 95% CF, -$15 avg offer (negative pricing, Jan high-wind)
- Coal: 64% CF, +$1 avg offer (low-cost baseload)
- Gas: 29% CF, +$241 avg offer (peakers at marginal)
- Solar: 85% CF (avg when online — winter daytime)
- Storage: 4% CF (arbitrage/ancillary only)

**Why:** Real offer curves confirm the actual ERCOT merit order — gas peakers set the marginal price, nuclear/wind are must-run, storage is pure arbitrage.
