---
name: PyPSA OPF ERCOT Congestion Calibration
description: Why the 5-bus ERCOT DC OPF produced zero LMP spread and how to fix it; high-load infeasibility fix
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

## High-Load Infeasibility Fix (≥75 GW)
**Problem**: OPF returns None/infeasible at system_load_mw ≥ 80,000 MW. Zone peakers (7 buses, 106 GW total) can't route power to all 340 loaded buses via transmission — LP becomes infeasible.

**Fix** (network.py `_build_tier2`): After load assignment, add a "last-resort" generator at every loaded bus:
```python
for load_name in list(n.loads.index):
    bus_name = str(n.loads.at[load_name, "bus"])
    load_set  = float(n.loads.at[load_name, "p_set"])
    n.add("Generator", f"{bus_name}-lsr", bus=bus_name, carrier="peaker",
          p_nom=load_set * 1.3, marginal_cost=999.0, p_max_pu=1.0, p_min_pu=0.0)
```
Also scale zone peakers: `pnom = max(PEAKER_ZONES.get(zone, 5000), system_load_mw * 0.30)`.

**Why it works**: Every bus can serve its own load locally at $999/MWh — guarantees LP feasibility regardless of transmission topology. HiGHS handles 2348 variables (341 more vs baseline) in 0.21s.

**Verified results**: 85 GW → avg_lmp=$195, 100 GW → avg_lmp=$562, both "optimal" status.

## LMP Sensitivity (for user communication)
- **Gas price** = primary avg LMP driver. $3.50→$8.00/MMBtu moves avg $23→$53.
- **Wind/Solar CF** = changes dispatch mix and congestion spread but NOT avg LMP when gas is still marginal. CF 10%→55% moves avg $35→$23 (CT→CC marginal transition).
- **System Load** = drives LMP at high levels: 55→85→100 GW → $23→$195→$562/MWh (peakers kick in).

## ML Importance Endpoint
Returns `features` key (not `importance`): `{ features: [{feature, importance}, ...] }`
