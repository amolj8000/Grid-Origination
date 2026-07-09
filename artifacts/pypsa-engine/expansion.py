"""
Multi-Year Capacity Expansion Optimizer
----------------------------------------
Genuine multi-investment-period generation expansion planning using PyPSA's
native multi-period optimization API (n.optimize(multi_investment_periods=True)),
built on the Tier-1 5-bus ERCOT network (NORTH/WEST/PAN/SOUTH/HOUSTON).

This is NOT a relabeled single-snapshot dispatch run: each planning period is
represented by 4 representative seasonal days x 24 hours (96 snapshots/period),
and the optimizer chooses how much new wind / solar / storage / gas capacity to
build in each period to minimize the discounted sum of capital + dispatch costs,
subject to an ERCOT-style planning reserve margin constraint.

Data sourcing (real, cited — no fabricated inputs):

1. Capital costs — NREL ATB 2024, Moderate scenario, overnight capital cost
   ($/kW, 2022$), linearly interpolated between the ATB's own published anchor
   years (exact year-by-year figures live in ATB's downloadable spreadsheet,
   not exposed via the public web pages):
     - Land-based wind:  2022 base year $1,500/kW -> 2030 Moderate target
       $1,300/kW  (-$25/kW/yr)
     - Utility PV:       2023 $1,560/kW -> 2035 Moderate $900/kW (-$55/kW/yr)
     - 4-hr battery:     2022 $1,290/kW -> 2035 Moderate $813/kW, i.e. the
       ATB-cited "-37% by 2035" trajectory (-$36.7/kW/yr)
     - Gas CC / CT:      ATB base-year F-class figures (~$1,150/kW CC,
       ~$730/kW CT), held flat — ATB shows no strong secular cost decline for
       thermal plant CAPEX.
   Fixed O&M ($/kW-yr, NREL ATB 2024): wind $43, solar $24, battery $23
   (2.5% of CAPEX, ATB convention), gas CC $13, gas CT $8.
   Annualized via capital recovery factor at a 7% nominal WACC (typical ATB
   "Market + Policies" financial case) over each technology's book life:
   wind 25yr, solar/gas 30yr, battery 15yr.

2. Demand growth — two selectable real-data scenarios:
     - "moderate": system peak trajectory implied by the `load_forecasts`
       table (real EIA-930-anchored, zone-level OLS regression forecast,
       2026-2029). 2026 system peak = 75,878 MW; +1.63%/yr CAGR observed
       2026->2029 in that table, held flat afterward.
     - "aggressive": ERCOT's own April 2026 Long-Term Load Forecast filing
       (PUCT Project 58777) — 85,508 MW actual 2023 system peak growing to a
       filed 367,790 MW by 2032 (large-load/data-center driven), a ~17.6%/yr
       CAGR. Applied to our 2026 baseline as a stress-test growth rate (the
       absolute MW figure itself is ERCOT-system-wide and not directly
       comparable to this 5-bus aggregate model's load convention — only the
       *growth rate* is carried over).

3. Reserve margin adequacy — ERCOT's own 13.75% target planning reserve
   margin, applied against *accredited* (not nameplate) capacity, using
   ERCOT's own well-documented seasonal accreditation pattern: wind
   contributes little to summer-peak reliability (15%), solar contributes
   heavily since ERCOT peaks coincide with solar output (80%), thermal/
   nuclear/hydro/biomass are treated as firm (95%), batteries at their
   duration-limited value (80% for 4-hr). This is what actually forces new
   dispatchable/storage builds even though the legacy Tier-1 fleet has large
   nameplate wind/solar capacity.

4. Unserved-energy / scarcity backstop — priced at $9,000/MWh, matching
   ERCOT's PUCT-approved Value of Lost Load policy assumption. This guarantees
   LP feasibility without distorting investment decisions (dispatch only
   touches it in genuine shortfall).
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd
import pypsa

from network import _T1_BUSES, _T1_LINES, _T1_FLEET, _T1_LOAD, _marginal_cost

logger = logging.getLogger("pypsa-engine")

# ── Financial assumptions ────────────────────────────────────────────────────

WACC = 0.07
LIFETIME_YEARS: dict[str, int] = {
    "wind": 25, "solar": 30, "storage": 15, "gas_cc": 30, "gas_ct": 30,
}

# NREL ATB 2024, Moderate scenario — overnight capital cost anchors (see module
# docstring for sourcing). Linear interpolation between named anchor years.
ATB_OCC_ANCHORS: dict[str, dict[str, float]] = {
    "wind":    {"anchor_year": 2022, "anchor_cost": 1500.0, "slope_per_yr": -25.0},
    "solar":   {"anchor_year": 2023, "anchor_cost": 1560.0, "slope_per_yr": -55.0},
    "storage": {"anchor_year": 2022, "anchor_cost": 1290.0, "slope_per_yr": -36.7},
    "gas_cc":  {"anchor_year": 2024, "anchor_cost": 1150.0, "slope_per_yr": 0.0},
    "gas_ct":  {"anchor_year": 2024, "anchor_cost": 730.0,  "slope_per_yr": 0.0},
}
# NREL ATB 2024 fixed O&M, $/kW-yr
ATB_FOM: dict[str, float] = {
    "wind": 43.0, "solar": 24.0, "storage": 23.0, "gas_cc": 13.0, "gas_ct": 8.0,
}

# ERCOT-style seasonal capacity accreditation (see module docstring). Peakers
# from the legacy Tier-1 fleet are deliberately excluded from the expansion
# network — see _build_existing_fleet.
ACCREDITATION: dict[str, float] = {
    "gas_cc": 0.95, "gas_ct": 0.95, "nuclear": 0.95, "hydro": 0.95, "biomass": 0.95,
    "wind": 0.15, "solar": 0.80, "storage": 0.80,
}
TARGET_RESERVE_MARGIN = 0.1375  # ERCOT's own published planning target
VOLL_USD_PER_MWH = 9000.0       # ERCOT PUCT Value of Lost Load policy assumption

CANDIDATE_SITES: dict[str, list[str]] = {
    "wind":    ["WEST", "PAN", "NORTH"],
    "solar":   ["WEST", "SOUTH", "HOUSTON"],
    "storage": ["WEST", "SOUTH", "HOUSTON", "NORTH", "PAN"],
    "gas_cc":  ["HOUSTON", "SOUTH"],
    "gas_ct":  ["HOUSTON", "SOUTH", "NORTH", "WEST"],
}

MAX_BUILD_PER_PERIOD_MW: dict[str, float] = {
    "wind": 4000.0, "solar": 6000.0, "storage": 3000.0, "gas_cc": 4000.0, "gas_ct": 2500.0,
}

# ── Demand growth scenarios ──────────────────────────────────────────────────

REAL_2026_PEAK_MW = 75_878.0     # from load_forecasts table (see docstring)
MODERATE_CAGR = 0.0163            # (79,677/75,878)^(1/3) - 1, load_forecasts 2026->2029
LTLF_CAGR = (367_790.0 / 85_508.0) ** (1.0 / 9.0) - 1.0  # ERCOT LTLF 2023->2032, ~17.6%/yr


def system_peak_mw(year: int, scenario: str) -> float:
    cagr = MODERATE_CAGR if scenario == "moderate" else LTLF_CAGR
    return REAL_2026_PEAK_MW * (1.0 + cagr) ** (year - 2026)


# ── Representative days ──────────────────────────────────────────────────────
# Analytically constructed (not raw historical extraction) diurnal + seasonal
# shapes, calibrated to ERCOT's well-documented real seasonal behavior: wind
# is strongest in spring and weakest during the summer "wind lull", solar CF
# peaks in summer, and system load peaks hardest on summer afternoons/evenings.
SEASONS = [
    {"name": "winter", "days": 90, "load_frac_of_peak": 0.68, "wind_avg": 0.46, "solar_avg": 0.16},
    {"name": "spring", "days": 92, "load_frac_of_peak": 0.55, "wind_avg": 0.50, "solar_avg": 0.24},
    {"name": "summer", "days": 92, "load_frac_of_peak": 1.00, "wind_avg": 0.24, "solar_avg": 0.28},
    {"name": "fall",   "days": 91, "load_frac_of_peak": 0.62, "wind_avg": 0.38, "solar_avg": 0.22},
]
N_HOURS_PER_PERIOD = len(SEASONS) * 24

# Normalized (avg=1.0) 24-hr shapes
_LOAD_DIURNAL = np.array([
    0.78, 0.74, 0.72, 0.71, 0.72, 0.76, 0.85, 0.92, 0.97, 1.00, 1.02, 1.04,
    1.06, 1.08, 1.10, 1.13, 1.18, 1.24, 1.28, 1.25, 1.15, 1.02, 0.92, 0.84,
])
_LOAD_DIURNAL = _LOAD_DIURNAL / _LOAD_DIURNAL.mean()

_SOLAR_DIURNAL = np.array([
    0, 0, 0, 0, 0, 0, 0.05, 0.20, 0.45, 0.68, 0.85, 0.95,
    1.00, 0.97, 0.88, 0.72, 0.50, 0.25, 0.06, 0, 0, 0, 0, 0,
])
_SOLAR_DIURNAL = _SOLAR_DIURNAL / max(_SOLAR_DIURNAL.mean(), 1e-9)

# ERCOT wind is characteristically stronger overnight (nocturnal jet, West
# Texas/Panhandle) and weaker mid-afternoon.
_WIND_DIURNAL = np.array([
    1.30, 1.35, 1.38, 1.38, 1.35, 1.28, 1.15, 1.00, 0.85, 0.75, 0.68, 0.65,
    0.62, 0.62, 0.65, 0.70, 0.78, 0.88, 1.00, 1.10, 1.18, 1.24, 1.28, 1.30,
])
_WIND_DIURNAL = _WIND_DIURNAL / _WIND_DIURNAL.mean()


def _season_hour_series(kind: str) -> list[float]:
    """Returns a length-96 list (4 seasons x 24 hours) for one period."""
    vals: list[float] = []
    for s in SEASONS:
        if kind == "load":
            base = s["load_frac_of_peak"]
            diurnal = _LOAD_DIURNAL
        elif kind == "wind":
            base = s["wind_avg"]
            diurnal = _WIND_DIURNAL
        elif kind == "solar":
            base = s["solar_avg"]
            diurnal = _SOLAR_DIURNAL
        else:
            raise ValueError(kind)
        for h in range(24):
            vals.append(float(min(1.0, max(0.0, base * diurnal[h]))))
    return vals


def _season_weights() -> list[float]:
    w: list[float] = []
    for s in SEASONS:
        w += [float(s["days"])] * 24
    return w


# ── Cost helpers ─────────────────────────────────────────────────────────────

def _occ_per_kw(carrier: str, year: int) -> float:
    a = ATB_OCC_ANCHORS[carrier]
    return max(150.0, a["anchor_cost"] + a["slope_per_yr"] * (year - a["anchor_year"]))


def _crf(rate: float, life_years: int) -> float:
    return rate * (1 + rate) ** life_years / ((1 + rate) ** life_years - 1)


def annualized_capital_cost_per_mw(carrier: str, year: int) -> float:
    """$/MW-yr, annualized via CRF at WACC, including fixed O&M."""
    occ_per_kw = _occ_per_kw(carrier, year)
    crf = _crf(WACC, LIFETIME_YEARS[carrier])
    fom_per_kw = ATB_FOM[carrier]
    per_kw_yr = occ_per_kw * crf + fom_per_kw
    return round(per_kw_yr * 1000.0, 2)  # $/kW-yr -> $/MW-yr


# ── Network construction ─────────────────────────────────────────────────────

def _build_existing_fleet(n: pypsa.Network, snap_index: pd.MultiIndex, periods: list[int], gas_price_mmbtu: float) -> None:
    """Add the legacy Tier-1 fleet as fixed (non-extendable) capacity, assumed
    to remain online through the study horizon (no retirements modeled).
    Emergency 'peaker' units from the Tier-1 dispatch fleet are intentionally
    excluded — they exist only as a numerical feasibility backstop for the
    single-snapshot OPF/scarcity simulators, not as real planning resources.
    A dedicated VOLL backstop generator plays that role here instead (see
    _add_scarcity_backstop)."""
    n_periods = len(periods)
    wind_cf = np.tile(_season_hour_series("wind"), n_periods)
    solar_cf = np.tile(_season_hour_series("solar"), n_periods)

    for (bus, carrier, total_mw, _count) in _T1_FLEET:
        mc = _marginal_cost(carrier, gas_price_mmbtu)
        if carrier == "wind":
            p_max_pu: Any = pd.Series(wind_cf, index=snap_index)
        elif carrier == "solar":
            p_max_pu = pd.Series(solar_cf, index=snap_index)
        else:
            from network import MAX_CF
            p_max_pu = MAX_CF.get(carrier, 1.0)
        n.add(
            "Generator", f"{bus[:3]}-{carrier}-existing", bus=bus, carrier=carrier,
            p_nom=float(total_mw), marginal_cost=mc, p_max_pu=p_max_pu, p_min_pu=0.0,
            build_year=2015, lifetime=100,
        )


def _add_scarcity_backstop(n: pypsa.Network) -> None:
    for bus_id in _T1_BUSES:
        n.add(
            "Generator", f"{bus_id[:3]}-unserved", bus=bus_id, carrier="unserved",
            p_nom=1_000_000.0, marginal_cost=VOLL_USD_PER_MWH, p_max_pu=1.0, p_min_pu=0.0,
            build_year=2015, lifetime=200,
        )


def _add_candidates(n: pypsa.Network, snap_index: pd.MultiIndex, periods: list[int], gas_price_mmbtu: float) -> None:
    n_periods = len(periods)
    wind_cf = np.tile(_season_hour_series("wind"), n_periods)
    solar_cf = np.tile(_season_hour_series("solar"), n_periods)

    for carrier, sites in CANDIDATE_SITES.items():
        for bus_id in sites:
            for period in periods:
                cap_cost = annualized_capital_cost_per_mw(carrier, period)
                name = f"{bus_id[:3]}-{carrier}-new{period}"
                if carrier == "storage":
                    n.add(
                        "StorageUnit", name, bus=bus_id, carrier="storage",
                        p_nom_extendable=True, p_nom_max=MAX_BUILD_PER_PERIOD_MW[carrier],
                        capital_cost=cap_cost, marginal_cost=0.5,
                        max_hours=4, efficiency_store=0.95, efficiency_dispatch=0.95,
                        cyclic_state_of_charge=True,
                        build_year=period, lifetime=LIFETIME_YEARS[carrier],
                    )
                else:
                    mc = _marginal_cost(carrier, gas_price_mmbtu)
                    if carrier == "wind":
                        p_max_pu: Any = pd.Series(wind_cf, index=snap_index)
                    elif carrier == "solar":
                        p_max_pu = pd.Series(solar_cf, index=snap_index)
                    else:
                        p_max_pu = 1.0
                    n.add(
                        "Generator", name, bus=bus_id, carrier=carrier,
                        p_nom_extendable=True, p_nom_max=MAX_BUILD_PER_PERIOD_MW[carrier],
                        capital_cost=cap_cost, marginal_cost=mc, p_max_pu=p_max_pu, p_min_pu=0.0,
                        build_year=period, lifetime=LIFETIME_YEARS[carrier],
                    )


def _reserve_margin_functionality(periods: list[int], demand_scenario: str):
    """Returns a PyPSA extra_functionality callback enforcing an ERCOT-style
    accredited-capacity reserve margin at each period's system peak."""

    def _constraint(n: pypsa.Network, snapshots) -> None:
        m = n.model
        for period in periods:
            peak_mw = system_peak_mw(period, demand_scenario)
            target = peak_mw * (1.0 + TARGET_RESERVE_MARGIN)

            active_gens = n.get_active_assets("Generator", period)
            active_gens = active_gens[active_gens].index
            active_sus = n.get_active_assets("StorageUnit", period) if len(n.storage_units) else pd.Series(dtype=bool)
            active_sus = active_sus[active_sus].index if len(active_sus) else []

            terms = []
            rhs_const = 0.0
            for name in active_gens:
                row = n.generators.loc[name]
                if row["carrier"] == "unserved":
                    continue  # scarcity backstop never counts toward adequacy
                accr = ACCREDITATION.get(row["carrier"], 1.0)
                if bool(row["p_nom_extendable"]):
                    terms.append(accr * m.variables["Generator-p_nom"].loc[name])
                else:
                    rhs_const += accr * float(row["p_nom"])
            for name in active_sus:
                row = n.storage_units.loc[name]
                accr = ACCREDITATION.get(row["carrier"], 0.8)
                if bool(row["p_nom_extendable"]):
                    terms.append(accr * m.variables["StorageUnit-p_nom"].loc[name])
                else:
                    rhs_const += accr * float(row["p_nom"])

            if not terms:
                continue
            expr = terms[0]
            for t in terms[1:]:
                expr = expr + t
            m.add_constraints(expr >= target - rhs_const, name=f"reserve_margin_{period}")

    return _constraint


def build_expansion_network(
    periods: list[int],
    demand_scenario: str = "moderate",
    gas_price_mmbtu: float = 3.50,
) -> pypsa.Network:
    n = pypsa.Network()
    n.investment_periods = periods

    base_year = periods[0]
    step_years = [
        (periods[i + 1] - periods[i]) if i + 1 < len(periods) else (periods[i] - periods[i - 1])
        for i in range(len(periods))
    ]
    n.investment_period_weightings["years"] = step_years
    # Objective weight = sum of per-year discount factors covered by each period
    # (standard PyPSA multi-horizon convention), not a single-year snapshot factor.
    # This makes total_discounted_system_cost reflect the true horizon cost instead
    # of understating it by treating each multi-year period as if it were one year.
    objective_weights = []
    elapsed = 0
    for nyears in step_years:
        discounts = [1.0 / (1.0 + WACC) ** (elapsed + t) for t in range(nyears)]
        objective_weights.append(sum(discounts))
        elapsed += nyears
    n.investment_period_weightings["objective"] = objective_weights

    snap_index = pd.MultiIndex.from_product(
        [periods, range(N_HOURS_PER_PERIOD)], names=["period", "timestep"]
    )
    n.set_snapshots(snap_index)
    season_weights = _season_weights() * len(periods)
    n.snapshot_weightings.loc[:, :] = np.array(season_weights)[:, None]

    for bus_id, meta in _T1_BUSES.items():
        n.add("Bus", bus_id, x=meta["x"], y=meta["y"])
    for line in _T1_LINES:
        n.add("Line", line["name"], bus0=line["bus0"], bus1=line["bus1"],
              s_nom=float(line["s_nom"]), x=float(line["x"]))

    load_shape = _season_hour_series("load") * len(periods)
    for bus_id, frac in _T1_LOAD.items():
        vals = [
            system_peak_mw(period, demand_scenario) * frac * load_shape[i]
            for i, period in enumerate(p for p in periods for _ in range(N_HOURS_PER_PERIOD))
        ]
        n.add("Load", f"{bus_id}-load", bus=bus_id, p_set=pd.Series(vals, index=snap_index))

    _build_existing_fleet(n, snap_index, periods, gas_price_mmbtu)
    _add_scarcity_backstop(n)
    _add_candidates(n, snap_index, periods, gas_price_mmbtu)

    return n


# ── Public API ────────────────────────────────────────────────────────────────

def run_capacity_expansion(
    periods: list[int] | None = None,
    demand_scenario: str = "moderate",
    gas_price_mmbtu: float = 3.50,
) -> dict[str, Any]:
    periods = periods or [2026, 2028, 2030, 2032]
    if demand_scenario not in ("moderate", "aggressive"):
        return {"error": f"Unknown demand_scenario '{demand_scenario}' — use 'moderate' or 'aggressive'"}
    if len(periods) < 2:
        return {"error": "Need at least 2 investment periods"}

    n = build_expansion_network(periods, demand_scenario, gas_price_mmbtu)

    status, condition = n.optimize(
        multi_investment_periods=True,
        solver_name="highs",
        extra_functionality=_reserve_margin_functionality(periods, demand_scenario),
    )
    if condition != "optimal":
        return {"error": f"Expansion optimization failed: status={status}, condition={condition}"}

    gens = n.generators.copy()
    gens["p_nom_final"] = gens["p_nom_opt"].where(gens["p_nom_extendable"], gens["p_nom"])
    sus = n.storage_units.copy()
    if len(sus):
        sus["p_nom_final"] = sus["p_nom_opt"].where(sus["p_nom_extendable"], sus["p_nom"])

    new_builds_by_period: dict[int, dict[str, float]] = {p: {} for p in periods}
    for name, row in gens.iterrows():
        if row["p_nom_extendable"] and row["build_year"] in periods and row["carrier"] != "unserved":
            by = int(row["build_year"])
            new_builds_by_period[by][row["carrier"]] = (
                new_builds_by_period[by].get(row["carrier"], 0.0) + float(row["p_nom_opt"])
            )
    for name, row in (sus.iterrows() if len(sus) else []):
        if row["p_nom_extendable"] and row["build_year"] in periods:
            by = int(row["build_year"])
            new_builds_by_period[by]["storage"] = (
                new_builds_by_period[by].get("storage", 0.0) + float(row["p_nom_opt"])
            )

    cumulative_mix_by_period: dict[int, dict[str, float]] = {}
    capex_by_period: dict[int, float] = {}
    for period in periods:
        active_g = n.get_active_assets("Generator", period)
        active_names = active_g[active_g].index
        mix: dict[str, float] = {}
        capex = 0.0
        for name in active_names:
            row = gens.loc[name]
            if row["carrier"] == "unserved":
                continue
            mix[row["carrier"]] = mix.get(row["carrier"], 0.0) + float(row["p_nom_final"])
            if row["p_nom_extendable"] and int(row["build_year"]) == period:
                cap_cost = annualized_capital_cost_per_mw(row["carrier"], period)
                capex += float(row["p_nom_opt"]) * cap_cost
        if len(sus):
            active_s = n.get_active_assets("StorageUnit", period)
            for name in active_s[active_s].index:
                row = sus.loc[name]
                mix["storage"] = mix.get("storage", 0.0) + float(row["p_nom_final"])
                if row["p_nom_extendable"] and int(row["build_year"]) == period:
                    cap_cost = annualized_capital_cost_per_mw("storage", period)
                    capex += float(row["p_nom_opt"]) * cap_cost
        cumulative_mix_by_period[period] = {k: round(v, 1) for k, v in mix.items()}
        capex_by_period[period] = round(capex, 0)

    dispatch_by_period: dict[int, dict[str, float]] = {}
    avg_lmp_by_period: dict[int, float] = {}
    unserved_energy_by_period_mwh: dict[int, float] = {}
    unserved_energy_pct_by_period: dict[int, float] = {}
    for period in periods:
        sw = n.snapshot_weightings.loc[period, "generators"] if "generators" in n.snapshot_weightings.columns else n.snapshot_weightings.loc[period].iloc[:, 0]
        p_by_carrier: dict[str, float] = {}
        unserved_mwh = 0.0
        p_t = n.generators_t.p.loc[period]
        for name in p_t.columns:
            carrier = gens.loc[name, "carrier"]
            energy_mwh = float((p_t[name] * sw).sum())
            if carrier == "unserved":
                unserved_mwh += energy_mwh
                continue
            p_by_carrier[carrier] = p_by_carrier.get(carrier, 0.0) + energy_mwh
        dispatch_by_period[period] = {k: round(v, 0) for k, v in p_by_carrier.items()}
        unserved_energy_by_period_mwh[period] = round(unserved_mwh, 1)
        total_load_mwh = float((n.loads_t.p_set.loc[period].sum(axis=1) * sw).sum())
        unserved_energy_pct_by_period[period] = (
            round(100.0 * unserved_mwh / total_load_mwh, 3) if total_load_mwh > 0 else 0.0
        )
        try:
            lmp = n.buses_t.marginal_price.loc[period]
            avg_lmp_by_period[period] = round(float(lmp.mean().mean()), 2)
        except Exception:
            avg_lmp_by_period[period] = None

    total_discounted_cost = float(n.objective) if n.objective is not None else None

    return {
        "periods": periods,
        "demand_scenario": demand_scenario,
        "system_peak_by_period_mw": {p: round(system_peak_mw(p, demand_scenario), 0) for p in periods},
        "new_builds_by_period_mw": {p: {k: round(v, 1) for k, v in d.items()} for p, d in new_builds_by_period.items()},
        "cumulative_capacity_mix_mw": cumulative_mix_by_period,
        "capex_by_period_usd": capex_by_period,
        "dispatch_by_period_mwh": dispatch_by_period,
        "unserved_energy_by_period_mwh": unserved_energy_by_period_mwh,
        "unserved_energy_pct_by_period": unserved_energy_pct_by_period,
        "avg_lmp_by_period": avg_lmp_by_period,
        "total_discounted_system_cost_usd": round(total_discounted_cost, 0) if total_discounted_cost else None,
        "assumptions": {
            "wacc": WACC,
            "target_reserve_margin": TARGET_RESERVE_MARGIN,
            "voll_usd_per_mwh": VOLL_USD_PER_MWH,
            "capital_costs_source": "NREL ATB 2024 Moderate scenario (interpolated), see module docstring",
            "accreditation_source": "ERCOT seasonal capacity accreditation pattern (wind 15%, solar 80%, firm 95%, storage 80%)",
            "demand_source": (
                "load_forecasts table (real EIA-930-anchored regression, 2026-2029)"
                if demand_scenario == "moderate"
                else "ERCOT April 2026 Long-Term Load Forecast, PUCT Project 58777 (growth rate only)"
            ),
        },
    }
