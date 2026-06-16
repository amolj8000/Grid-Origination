---
name: PyPSA OPF ERCOT Congestion Calibration
description: Why the 5-bus ERCOT DC OPF produced zero LMP spread and how to fix it
---

## Rule
LMP spread is zero unless West Texas renewable generation **exceeds** the CREZ corridor export capacity. Default wind CF 35% is far below the congestion threshold. Use CF ≥ 55% AND tight line caps.

## Why
With wind_cf=0.35 and generous line caps (3500 MW), WEST only needs to export ~580 MW vs 5000 MW available — zero congestion, all buses equalize to gas CC marginal cost ($38).

## How to Apply
- **Calibrated line caps** (in network.py LINES): NORTH-WEST 2000 MW, WEST-PAN 1600 MW, WEST-SOUTH 600 MW
- **Default scenario**: wind_cf=0.55 → WEST needs to export 4180 MW but only has 2600 MW capacity → 3 lines congest, WEST/PAN LMP drops to $0, NORTH LMP stays at $38, spread = $38/MWh
- **Startup OPF** (main.py): call `_run_opf(wind_cf=0.55, solar_cf=0.25)` at startup so the cached default shows congestion immediately
- **Frontend slider default**: set windCf=55 in pypsa-network.tsx useState

## ML Importance Endpoint
Returns `features` key (not `importance`): `{ features: [{feature, importance}, ...] }`
