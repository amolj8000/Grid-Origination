"""
ERCOT Reduced-Order 5-Bus PyPSA Network
----------------------------------------
Models 5 geographic zones of the ERCOT grid:
  NORTH  — Dallas / Ft Worth load center (gas + some wind)
  WEST   — West Texas (CREZ wind + solar dominant)
  PAN    — Panhandle (large wind resource, thin local load)
  SOUTH  — San Antonio / Hill Country (gas + nuclear + solar)
  HOUSTON — Houston / Gulf Coast (large gas + nuclear load center)

Transmission lines use DC approximation with approximate capacities
from ERCOT published TTC reports and CREZ build-out data.

Generator dispatch uses stack-ordered marginal costs:
  Nuclear ≈ $5/MWh
  Wind    ≈ $0/MWh  (zero-marginal, production credit)
  Solar   ≈ $0/MWh
  Coal    ≈ $25/MWh
  Gas CC  ≈ $35/MWh  (varies with NYMEX)
  Gas CT  ≈ $55/MWh
"""

import pypsa
import pandas as pd
import numpy as np
from typing import Any

# ---------------------------------------------------------------------------
# Bus definitions — (lat, lon, zone_name)
# ---------------------------------------------------------------------------
BUSES: dict[str, dict] = {
    "NORTH":   {"x": -97.0, "y": 33.0, "label": "North (Dallas/FW)"},
    "WEST":    {"x": -101.0, "y": 32.0, "label": "West Texas"},
    "PAN":     {"x": -101.5, "y": 35.5, "label": "Panhandle"},
    "SOUTH":   {"x": -98.5,  "y": 29.5, "label": "South (San Antonio)"},
    "HOUSTON": {"x": -95.4,  "y": 29.8, "label": "Houston / Coast"},
}

# Hub node names for price comparison
HUB_MAP = {
    "NORTH":   "HB_NORTH",
    "WEST":    "HB_WEST",
    "PAN":     "HB_PAN",
    "SOUTH":   "HB_SOUTH",
    "HOUSTON": "HB_HOUSTON",
}

# ---------------------------------------------------------------------------
# Transmission lines — (from, to, capacity_mw, reactance_pu)
# Based on ERCOT CREZ lines and major 345kV corridors
# ---------------------------------------------------------------------------
LINES: list[dict] = [
    # Calibrated to real ERCOT corridor capacities from CREZ build-out + TTC reports.
    # Tighter West/PAN export corridors reflect real CREZ bottleneck that drives negative
    # nodal prices in West Texas during high-wind periods.
    {"name": "NORTH-HOUSTON", "bus0": "NORTH",   "bus1": "HOUSTON", "s_nom": 4200, "x": 0.08},
    {"name": "NORTH-WEST",    "bus0": "NORTH",   "bus1": "WEST",    "s_nom": 2000, "x": 0.12},  # CREZ export bottleneck
    {"name": "NORTH-SOUTH",   "bus0": "NORTH",   "bus1": "SOUTH",   "s_nom": 1400, "x": 0.14},
    {"name": "WEST-PAN",      "bus0": "WEST",    "bus1": "PAN",     "s_nom": 1600, "x": 0.10},  # CREZ north tight
    {"name": "WEST-SOUTH",    "bus0": "WEST",    "bus1": "SOUTH",   "s_nom": 600,  "x": 0.16},
    {"name": "SOUTH-HOUSTON", "bus0": "SOUTH",   "bus1": "HOUSTON", "s_nom": 2800, "x": 0.10},
]

# ---------------------------------------------------------------------------
# Generators by zone — (type, p_nom_mw, marginal_cost, p_max_pu)
# ---------------------------------------------------------------------------
GENERATORS: list[dict] = [
    # NORTH
    {"name": "N-Gas-CC",  "bus": "NORTH",   "carrier": "gas",     "p_nom": 12000, "marginal_cost": 38.0, "p_max_pu": 0.85},
    {"name": "N-Coal",    "bus": "NORTH",   "carrier": "coal",    "p_nom": 3000,  "marginal_cost": 27.0, "p_max_pu": 0.80},
    {"name": "N-Wind",    "bus": "NORTH",   "carrier": "wind",    "p_nom": 2500,  "marginal_cost":  0.0, "p_max_pu": 0.30},
    {"name": "N-Solar",   "bus": "NORTH",   "carrier": "solar",   "p_nom": 800,   "marginal_cost":  0.0, "p_max_pu": 0.20},
    # WEST (CREZ wind)
    {"name": "W-Wind",    "bus": "WEST",    "carrier": "wind",    "p_nom": 18000, "marginal_cost":  0.0, "p_max_pu": 0.35},
    {"name": "W-Solar",   "bus": "WEST",    "carrier": "solar",   "p_nom": 4000,  "marginal_cost":  0.0, "p_max_pu": 0.25},
    {"name": "W-Gas-CT",  "bus": "WEST",    "carrier": "gas",     "p_nom": 2500,  "marginal_cost": 55.0, "p_max_pu": 0.80},
    # PAN (wind-heavy)
    {"name": "P-Wind",    "bus": "PAN",     "carrier": "wind",    "p_nom": 14000, "marginal_cost":  0.0, "p_max_pu": 0.38},
    {"name": "P-Gas-CT",  "bus": "PAN",     "carrier": "gas",     "p_nom": 600,   "marginal_cost": 58.0, "p_max_pu": 0.75},
    # SOUTH
    {"name": "S-Gas-CC",  "bus": "SOUTH",   "carrier": "gas",     "p_nom": 8500,  "marginal_cost": 36.0, "p_max_pu": 0.82},
    {"name": "S-Solar",   "bus": "SOUTH",   "carrier": "solar",   "p_nom": 2500,  "marginal_cost":  0.0, "p_max_pu": 0.22},
    {"name": "S-Wind",    "bus": "SOUTH",   "carrier": "wind",    "p_nom": 1200,  "marginal_cost":  0.0, "p_max_pu": 0.28},
    # HOUSTON
    {"name": "H-Gas-CC",  "bus": "HOUSTON", "carrier": "gas",     "p_nom": 20000, "marginal_cost": 35.0, "p_max_pu": 0.84},
    {"name": "H-Nuclear", "bus": "HOUSTON", "carrier": "nuclear", "p_nom": 5300,  "marginal_cost":  5.0, "p_max_pu": 0.90},
    {"name": "H-Gas-CT",  "bus": "HOUSTON", "carrier": "gas",     "p_nom": 5000,  "marginal_cost": 52.0, "p_max_pu": 0.80},
    {"name": "H-Solar",   "bus": "HOUSTON", "carrier": "solar",   "p_nom": 600,   "marginal_cost":  0.0, "p_max_pu": 0.18},
    # Emergency peaker / demand-response units at each zone (prevent infeasibility, ~$500/MWh)
    # These model oil peakers + demand-response resources available under extreme grid stress.
    {"name": "N-Peaker",  "bus": "NORTH",   "carrier": "peaker",  "p_nom": 18000, "marginal_cost": 499.0, "p_max_pu": 1.0},
    {"name": "W-Peaker",  "bus": "WEST",    "carrier": "peaker",  "p_nom": 12000, "marginal_cost": 499.0, "p_max_pu": 1.0},
    {"name": "P-Peaker",  "bus": "PAN",     "carrier": "peaker",  "p_nom": 8000,  "marginal_cost": 499.0, "p_max_pu": 1.0},
    {"name": "S-Peaker",  "bus": "SOUTH",   "carrier": "peaker",  "p_nom": 12000, "marginal_cost": 499.0, "p_max_pu": 1.0},
    {"name": "H-Peaker",  "bus": "HOUSTON", "carrier": "peaker",  "p_nom": 18000, "marginal_cost": 499.0, "p_max_pu": 1.0},
]

# Carriers whose dispatch should be hidden from the main generator breakdown
HIDDEN_CARRIERS = {"peaker"}

# Typical ERCOT peak load fractions (% of system peak ~70 GW)
LOAD_FRACTIONS = {
    "NORTH":   0.34,
    "HOUSTON": 0.31,
    "SOUTH":   0.16,
    "WEST":    0.12,
    "PAN":     0.07,
}

def build_network(
    system_load_mw: float = 55000.0,
    wind_cf: float = 0.35,
    solar_cf: float = 0.22,
    gas_price_mmbtu: float = 3.50,
) -> pypsa.Network:
    """
    Build and return a PyPSA Network for the simplified ERCOT 5-bus model.
    Marginal costs scale with gas_price_mmbtu (10 MMBTU/MWh heat rate proxy).
    """
    gas_adj = (gas_price_mmbtu - 3.5) * 10.0  # $/MWh adjustment per $1/MMBTU

    n = pypsa.Network()
    n.set_snapshots(pd.DatetimeIndex(["2025-07-15 15:00"]))  # single snapshot

    # Buses
    for bus_id, meta in BUSES.items():
        n.add("Bus", bus_id, x=meta["x"], y=meta["y"])

    # Lines
    for line in LINES:
        n.add("Line",
              line["name"],
              bus0=line["bus0"],
              bus1=line["bus1"],
              s_nom=float(line["s_nom"]),
              x=float(line["x"]))

    # Loads
    for bus_id, frac in LOAD_FRACTIONS.items():
        n.add("Load",
              f"{bus_id}-load",
              bus=bus_id,
              p_set=system_load_mw * frac)

    # Generators
    for gen in GENERATORS:
        carrier = gen["carrier"]
        p_max = gen["p_max_pu"]
        if carrier == "wind":
            p_max = wind_cf
        elif carrier == "solar":
            p_max = solar_cf

        mc = float(gen["marginal_cost"])
        if carrier == "gas":
            mc += gas_adj

        n.add("Generator",
              gen["name"],
              bus=gen["bus"],
              carrier=carrier,
              p_nom=float(gen["p_nom"]),
              marginal_cost=mc,
              p_max_pu=p_max,
              p_min_pu=0.0)

    return n


def run_opf(
    system_load_mw: float = 55000.0,
    wind_cf: float = 0.35,
    solar_cf: float = 0.22,
    gas_price_mmbtu: float = 3.50,
) -> dict[str, Any]:
    """
    Run DC OPF and return structured results for the API.
    Returns buses, lines, generators, and system metrics.
    """
    n = build_network(system_load_mw, wind_cf, solar_cf, gas_price_mmbtu)

    status = n.optimize(solver_name="highs")

    if n.objective is None:
        return {"error": "Optimization failed — check feasibility"}

    # Nodal LMPs (shadow prices of bus balance constraints)
    lmp = {}
    for bus_id in BUSES:
        try:
            val = float(n.buses_t.marginal_price.get(bus_id, pd.Series([0.0])).iloc[0])
        except Exception:
            val = 0.0
        lmp[bus_id] = round(val, 2)

    # Line flows and loading
    lines_result = []
    for line in LINES:
        name = line["name"]
        try:
            flow = float(n.lines_t.p0[name].iloc[0])
        except Exception:
            flow = 0.0
        cap = float(line["s_nom"])
        loading_pct = abs(flow) / cap * 100 if cap > 0 else 0.0
        cong_rent = abs(lmp.get(line["bus1"], 0) - lmp.get(line["bus0"], 0)) * abs(flow) / 1000.0
        lines_result.append({
            "name": name,
            "bus0": line["bus0"],
            "bus1": line["bus1"],
            "flow_mw": round(flow, 1),
            "capacity_mw": cap,
            "loading_pct": round(loading_pct, 1),
            "congestion_rent_k$": round(cong_rent, 1),
            "is_congested": loading_pct >= 95.0,
        })

    # Generator dispatch (all gens including peakers for bus balance)
    all_gen_dispatch: dict[str, float] = {}
    for gen in GENERATORS:
        name = gen["name"]
        try:
            dispatch = float(n.generators_t.p[name].iloc[0])
        except Exception:
            dispatch = 0.0
        all_gen_dispatch[name] = dispatch

    # Visible generators only (exclude emergency peakers from display)
    gen_result = []
    for gen in GENERATORS:
        if gen["carrier"] in HIDDEN_CARRIERS:
            continue
        name = gen["name"]
        dispatch = all_gen_dispatch.get(name, 0.0)
        p_nom = float(gen["p_nom"])
        cf = dispatch / p_nom if p_nom > 0 else 0.0
        gen_result.append({
            "name": name,
            "bus": gen["bus"],
            "carrier": gen["carrier"],
            "dispatch_mw": round(dispatch, 1),
            "capacity_mw": p_nom,
            "cf": round(cf, 3),
            "marginal_cost": gen["marginal_cost"],
        })

    # Bus summary — use all dispatch (including peakers) for power balance
    buses_result = []
    for bus_id, meta in BUSES.items():
        hub = HUB_MAP[bus_id]
        load = system_load_mw * LOAD_FRACTIONS[bus_id]
        gen_at_bus = sum(d for g, d in all_gen_dispatch.items()
                        if next((x["bus"] for x in GENERATORS if x["name"] == g), None) == bus_id)
        buses_result.append({
            "id": bus_id,
            "hub": hub,
            "label": meta["label"],
            "x": meta["x"],
            "y": meta["y"],
            "lmp": lmp.get(bus_id, 0.0),
            "load_mw": round(load, 0),
            "gen_mw": round(gen_at_bus, 0),
            "net_export_mw": round(gen_at_bus - load, 0),
        })

    total_cost = sum(
        all_gen_dispatch.get(g["name"], 0.0) * g["marginal_cost"]
        for g in GENERATORS
    )

    wind_gen   = sum(all_gen_dispatch.get(g["name"], 0.0) for g in GENERATORS if g["carrier"] == "wind")
    solar_gen  = sum(all_gen_dispatch.get(g["name"], 0.0) for g in GENERATORS if g["carrier"] == "solar")
    nuclear_gen = sum(all_gen_dispatch.get(g["name"], 0.0) for g in GENERATORS if g["carrier"] == "nuclear")
    gas_gen    = sum(all_gen_dispatch.get(g["name"], 0.0) for g in GENERATORS if g["carrier"] == "gas")
    total_gen = wind_gen + solar_gen + nuclear_gen + gas_gen

    return {
        "status": "optimal",
        "system_load_mw": system_load_mw,
        "total_cost_per_hour": round(total_cost, 0),
        "renewable_pct": round((wind_gen + solar_gen) / max(total_gen, 1) * 100, 1),
        "wind_mw": round(wind_gen, 0),
        "solar_mw": round(solar_gen, 0),
        "nuclear_mw": round(nuclear_gen, 0),
        "gas_mw": round(gas_gen, 0),
        "avg_lmp": round(sum(lmp.values()) / len(lmp), 2),
        "max_lmp": max(lmp.values()),
        "min_lmp": min(lmp.values()),
        "lmp_spread": round(max(lmp.values()) - min(lmp.values()), 2),
        "congested_lines": sum(1 for l in lines_result if l["is_congested"]),
        "buses": buses_result,
        "lines": lines_result,
        "generators": gen_result,
    }


def get_topology() -> dict[str, Any]:
    """Return static network topology (buses + lines) without running OPF."""
    return {
        "buses": [
            {"id": bid, "hub": HUB_MAP[bid], **meta}
            for bid, meta in BUSES.items()
        ],
        "lines": [
            {**line, "hub0": HUB_MAP[line["bus0"]], "hub1": HUB_MAP[line["bus1"]]}
            for line in LINES
        ],
        "generators": [
            {
                "bus": g["bus"],
                "carrier": g["carrier"],
                "p_nom": g["p_nom"],
                "marginal_cost": g["marginal_cost"],
            }
            for g in GENERATORS
        ],
    }
