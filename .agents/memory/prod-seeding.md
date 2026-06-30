---
name: Prod DB seeding approach
description: How to seed the production database when child processes or scripts fail to connect
---

# Prod DB Seeding — Lessons Learned

## Child process DB connections work in prod
- Spawned scripts via `pnpm --filter @workspace/scripts run <script>` DO connect to the prod DB.
- They inherit `{ ...process.env }` including `DATABASE_URL` — SSL warning about sslmode is non-fatal.
- AESO seed (21k rows), queue seed (3,493 real projects), caiso-hourly all succeeded via child process.

## The one exception: XLSX parsing in autoscale
- `seed-ercot-hourly.ts` downloads a 21.3 MB XLSX from ERCOT CDR and parses sheet-by-sheet with xlsx/SheetJS.
- In prod autoscale container, this takes **1+ hour** (vs minutes in dev) due to CPU throttling.
- Symptom: job output stops at "Parsing RTM sheet by sheet..." for a very long time.
- The script is NOT stuck — it eventually completes, but timing is unpredictable.

**Why:** SheetJS parses the entire 21.3 MB file into memory as a JS object. Autoscale containers have throttled CPU — pure-JS compute is much slower than in dev.

**How to apply:** If ercot_hub_hourly shows 0 rows after triggering seed-ercot-hourly, do NOT assume it's stuck — wait 1-3 hours before concluding failure. Keep the container alive by making periodic admin API calls.

## Inline seed endpoints (fallback for any table)
- `POST /api/admin/reseed-aeso-inline` — seeds all 9 AESO tables using live db connection, no subprocess
- `POST /api/admin/reseed-queue-inline` — seeds queue_projects (1,500 rows) inline
- These always work because they use the same `db` pool the API server already has open.

## Admin endpoint pattern
- Auth: `Authorization: Bearer $SESSION_SECRET`
- Job tracker: `GET /api/admin/jobs/{jobId}`
- Topology (340 buses, 1807 lines): seeded inline via `POST /api/admin/reseed-topology`
- AESO data: seeded via `POST /api/admin/reseed-aeso` (child) or `reseed-aeso-inline` (inline)
- Queue: seeded via `POST /api/admin/reseed-queue-projects` (child) or `reseed-queue-inline` (inline)
- CAISO hourly: `POST /api/admin/reseed-caiso-hourly` — takes ~45 min
- ERCOT hourly: `POST /api/admin/reseed-ercot-hourly` — takes 1-3 hours

## Prod sync tables status (as of June 2026 sync)
- ercot_buses: 340 ✅, ercot_lines: 1807 ✅
- All 9 AESO tables: 100% ✅ (21k rows pool_price etc.)
- queue_projects: 3,493 ✅ (real CAISO queue from caiso.com + synthetic ERCOT/PJM)
- ercot_node_stats: 1,100 ✅, caiso_node_stats: 156 ✅
- candidates: 3,875 ✅
- caiso_hub_hourly: seeding via child process (~45 min)
- ercot_hub_hourly: seeding via child process (1-3 hours due to XLSX parsing)
