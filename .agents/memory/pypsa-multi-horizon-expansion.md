---
name: PyPSA multi-horizon capacity expansion
description: Lessons from building a multi-investment-period PyPSA capacity expansion LP (discounting convention, hiding unserved energy).
---

## Objective discounting convention
`n.investment_period_weightings["objective"]` must be the **sum of each year's discount
factor within that period**, not a single per-period discount factor evaluated at the
period's start year. Using a single-year factor for a multi-year period (e.g. a 2-year
step) silently understates the reported total discounted system cost by roughly the
step length, even though build decisions stay unbiased (the error is a constant
multiplier applied uniformly).

**Why:** A code reviewer (architect) caught this because the pattern computes the same
build-out either way, so it doesn't fail solver validation or feasibility checks — only
a KPI like "Total Discounted System Cost" reveals the discrepancy, and by ~2x for 2-year
steps.

**How to apply:** When setting up `investment_period_weightings`, loop through elapsed
years and sum `1/(1+r)**t` for every year `t` the period spans, not just discount the
period's start year.

## Don't hide unserved energy / VOLL dispatch from summary output
If a capacity-expansion or dispatch model includes a VOLL (value of lost load) scarcity
backstop generator, do not filter it out of every reported aggregate. It's fine to
exclude it from a "resource mix" breakdown, but report unserved MWh and % of load
per period as an explicit, separate field. Omitting it makes a high-LMP period look like
ordinary tight-but-feasible supply when it is actually significant demand curtailment —
exactly the kind of gap a skeptical reviewer (or resume fact-checker) will flag.

**How to apply:** Track energy served by the "unserved"/VOLL carrier separately in the
same loop that aggregates other carriers' dispatch, and surface both the MWh and the
percentage of total load in the API response and any UI built on top of it.
