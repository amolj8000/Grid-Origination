---
name: PyPSA Engine setup
description: Python FastAPI microservice for DC OPF and XGBoost ML; venv, routing, solver quirks.
---

## Python venv on NixOS (Replit)

Python is at `/home/runner/workspace/.pythonlibs/bin/python3` (NOT the Nix store).
Create venv and install with `uv` (available at `/nix/store/.../uv`):

```bash
cd artifacts/pypsa-engine
uv venv .venv --python /home/runner/workspace/.pythonlibs/bin/python3
uv pip install -r requirements.txt --python .venv/bin/python
```

Workflow command: `cd artifacts/pypsa-engine && PORT=8083 .venv/bin/python main.py`

Do NOT use `installLanguagePackages` (writes to immutable Nix store → permission denied).

## Proxy routing

`verifyAndReplaceArtifactToml` requires an *existing* artifact.toml — cannot create from scratch.
To route `/pypsa` → port 8083: add a second `[[services]]` block to the **api-server** artifact.toml.

## OPF feasibility

PyPSA 5-bus DC OPF with HiGHS solver becomes infeasible at high system loads (>60 GW) due to
KVL constraints on the simplified network topology.

**Fix:** Add emergency peaker generators at each bus (carrier `"peaker"`, $499/MWh marginal cost,
large p_nom). Filter them out of the displayed gen_result using a `HIDDEN_CARRIERS` set.
They ensure the LP always has a feasible solution; their dispatch signals extreme grid stress.

## node-series API shape

`/api/congestion-intel/node-series` returns a **flat JSON array** (not `{series: [...]}`).
Field names: `avgRt`, `avgDa`, `basis`, `volatility`, `negPricePct`, `onPeakAvg`, `offPeakAvg`.
(NOT `avgRtPrice` / `avgDaPrice` — those don't exist.)

**Why:** The CI server route was written before the hourly page; it returns camelCase directly.

## ML model

Trains on `ercot_node_stats` monthly data. Split: ≤2024 train / ≥2025 test.
Results: MAE ~$3.35/MWh, 93.1% accuracy on congestion classification.
Top features: season (38%), 3-month rolling basis (19%), volatility (17%), month (10%).
F1 is low (0.005) because congestion events are rare — class imbalance on resource nodes.
Model persists to `artifacts/pypsa-engine/models/` via joblib.
