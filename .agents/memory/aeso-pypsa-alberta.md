---
name: Alberta 3-node PyPSA OPF
description: 3-node Alberta DC OPF model endpoints, calibration findings, and physical behaviour
---

# Alberta 3-Node PyPSA OPF

## Model
File: `artifacts/pypsa-engine/aeso_network.py`
Endpoints on PyPSA FastAPI service:
- `GET  /pypsa/aeso/topology`       — static 3-node topology for map
- `POST /pypsa/aeso/opf`           — parametric DC OPF
- `GET  /pypsa/aeso/opf/default`   — cached high-wind default result
- `POST /pypsa/aeso/sensitivity`   — single-param sweep (wind_cf, gas_price_mmbtu, system_load_mw, south_central_limit_mw)

## Nodes
- SOUTH: Southern AB wind belt — 6,200 MW wind, 900 MW solar, 600 MW gas; load 2,500 MW
- CENTRAL: Edmonton-Calgary corridor — 9,000 MW gas, 900 MW hydro; load 9,500 MW
- NORTH: Oil sands cogen — 5,000 MW gas/cogen, 200 MW biomass; load 3,200 MW

## Transmission
- SOUTH→CENTRAL: 2,800 MW (Southern Export Corridor — key constraint)
- CENTRAL→NORTH: 1,400 MW (N-S 500kV corridor)

## Key calibration findings
- At default load (10,500 MW) + wind_cf=0.55: CENTRAL-NORTH congests (100%) before SOUTH-CENTRAL
- SOUTH-CENTRAL corridor congests at wind_cf ≥ 0.7 (system_load=10,500 MW) → SOUTH LMP drops to ~$0
- Wind curtailment starts at CF=0.7 (~11 MW), grows rapidly (CF=0.8 → 433 MW)
- LMP spread at high wind: SOUTH $0 vs CENTRAL $31.50 = $31.50/MWh S→C spread

## API version note
- `net.optimize.termination_condition` does NOT exist in this PyPSA version
- Check `net.buses_t.marginal_price.empty` instead to detect infeasibility
- ERCOT network.py uses same pattern (just catches exceptions, no status check)

**Why:** AESO plans nodal LMP (REM) for mid-2027; this 3-node model is a planning/research tool showing indicative spatial price formation under REM-style dispatch. Alberta has NO coal (phased out 2023).
