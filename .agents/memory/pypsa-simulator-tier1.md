---
name: PyPSA simulator Tier-1 vs Tier-2 usage
description: Which pypsa-engine simulators use the 5-bus Tier-1 model vs the real 340-bus Tier-2 model, and pitfalls when switching one over.
---

## Rule
`simulators.py` has its own local `build_network()` shim that always calls `_build_tier1(...)` — this is deliberate, not an oversight. `run_curtailment` and `run_tx_relief` still use this Tier-1-only shim and must keep doing so.

`run_scarcity` is the exception: it now calls `network.build_network(...)` (aliased as `_build_network_real`) directly, which auto-selects Tier-2 (340-bus) when the DB has topology seeded, falling back to Tier-1 only if it doesn't. It aggregates results generically from `n.generators.index` / `n.buses.index` / `n.loads.index` (never Tier-1's fixed 5-name constants `BUSES`/`GENERATORS`), then rolls the 340 buses up into 5 ERCOT hub buckets via `bus_hub_map()` so the frontend (`load-forecast-stress.tsx`) needs no changes.

**Why:** An earlier naive swap of `run_curtailment`'s network builder from Tier-1 to Tier-2 caused a "100% curtailment" bug because the code still looked up dispatch by Tier-1's fixed generator names, which don't exist in the Tier-2 network — so every lookup silently defaulted to 0 output. Any future Tier-1→Tier-2 migration for a simulator must audit every place that indexes buses/generators/lines by a Tier-1 constant name and replace it with a generic `n.<component>.index` iteration.

**How to apply:** Before switching any other simulator (or before adding a new one) to Tier-2, grep for `BUSES`, `GENERATORS`, `LOAD_FRACTIONS`, `HUB_MAP` usage in that function — those are Tier-1-only constants and must not be assumed to match Tier-2 bus/generator names.

## Check every frontend consumer of a shared endpoint, not just the one you're changing
`/pypsa/scarcity` has two frontend consumers: `load-forecast-stress.tsx` (current, uses only `zone_risk`) and an older `pypsa-scarcity.tsx` page (uses `lmp[busId]` keyed by hub label, e.g. `lmp["NORTH"]`). When `run_scarcity` switched to Tier-2, the `lmp` dict became keyed by real 340-bus names, silently breaking the older page's LMP display (rendered $0 everywhere, no crash/error). Fix: merge hub-level weighted LMP into the same `lmp` dict under the hub label keys too, alongside the real bus keys — additive, non-breaking for both consumers.

**Why:** A response shape that "looks compatible" (same field name, same type) can still silently break a second consumer that relies on specific key values, not just the field's presence. TypeScript's `as ScarcityResult` cast does not catch this.

**How to apply:** Before changing what an endpoint's dict/array values represent (not just adding fields), grep the whole frontend for every file that calls that endpoint, not just the page you're actively working on.

## Tier-2 solve is slow and single-worker
A full 340-bus Tier-2 OPF solve (`run_scarcity`) takes roughly 20-60 seconds per call (LP has ~6,500 rows / ~2,300 cols), vs sub-second for Tier-1's 5-bus LP. The FastAPI endpoint (`def scarcity(...)`, a sync `def`) runs in a threadpool, but repeated/concurrent requests queue up and each new request re-solves from scratch (no caching), so firing several requests back-to-back (e.g. during manual testing) creates a visible backlog — the workflow's health check can then read as "failed" even though the process is still alive and churning through the queue.

**Why:** This is very likely the same root cause behind a previously reported PyPSA Engine 502 (heavy synchronous OPF calls piling up and starving the single worker). It is a pre-existing architecture limitation, not something introduced by any one endpoint.

**How to apply:** When testing pypsa-engine endpoints from the shell, issue one request at a time with a generous timeout (60-90s) and wait for it to finish before firing another — do not retry-loop on short timeouts, as that stacks up solves and makes the workflow look stuck. If the workflow shows "failed" during testing, check the logs for an in-progress `HiGHS run time` before assuming it's actually crashed.
