"""
PyPSA Engine — FastAPI microservice
------------------------------------
Endpoints:
  GET  /pypsa/healthz
  GET  /pypsa/network            — static ERCOT 5-bus topology
  POST /pypsa/opf                — run DC OPF with custom scenario params
  GET  /pypsa/ml/status          — check if model is trained
  POST /pypsa/ml/train           — train XGBoost on ercot_node_stats
  GET  /pypsa/ml/predict         — predict basis for node/month
  GET  /pypsa/ml/importance      — feature importance ranking
"""

import os
import logging
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pypsa-engine")

app = FastAPI(title="PyPSA Engine", root_path="/pypsa")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/healthz")
def healthz():
    return {"status": "ok", "service": "pypsa-engine"}


# ---------------------------------------------------------------------------
# Network topology + OPF
# ---------------------------------------------------------------------------
@app.get("/network")
def get_network():
    from network import get_topology
    return get_topology()


class OPFRequest(BaseModel):
    system_load_mw: float = 55000.0
    wind_cf: float        = 0.35
    solar_cf: float       = 0.22
    gas_price_mmbtu: float = 3.50


@app.post("/opf")
def run_opf(req: OPFRequest):
    from network import run_opf as _run_opf
    try:
        result = _run_opf(
            system_load_mw=req.system_load_mw,
            wind_cf=req.wind_cf,
            solar_cf=req.solar_cf,
            gas_price_mmbtu=req.gas_price_mmbtu,
        )
        if "error" in result:
            raise HTTPException(status_code=422, detail=result["error"])
        return result
    except Exception as e:
        logger.error("OPF failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# Pre-run default OPF on startup for caching
_opf_cache: dict | None = None

@app.on_event("startup")
async def startup_event():
    global _opf_cache
    try:
        from network import run_opf as _run_opf
        logger.info("Pre-computing default OPF on startup...")
        _opf_cache = _run_opf()
        logger.info("OPF ready — avg LMP $%.2f, spread $%.2f",
                    _opf_cache.get("avg_lmp", 0), _opf_cache.get("lmp_spread", 0))
    except Exception as e:
        logger.warning("Startup OPF failed (non-fatal): %s", e)


@app.get("/opf/default")
def get_default_opf():
    """Return cached default scenario OPF result."""
    if _opf_cache:
        return _opf_cache
    from network import run_opf as _run_opf
    return _run_opf()


# ---------------------------------------------------------------------------
# ML model
# ---------------------------------------------------------------------------
_training = False

@app.get("/ml/status")
def ml_status():
    from ml_model import get_status
    status = get_status()
    status["training_in_progress"] = _training
    return status


@app.post("/ml/train")
async def ml_train(background_tasks: BackgroundTasks):
    global _training
    if _training:
        return {"message": "Training already in progress"}
    _training = True

    def do_train():
        global _training
        try:
            from ml_model import train
            result = train()
            logger.info("ML training complete — MAE=%.2f, F1=%.3f",
                        result.get("mae", 0), result.get("f1", 0))
        except Exception as e:
            logger.error("ML training failed: %s", e)
        finally:
            _training = False

    background_tasks.add_task(do_train)
    return {"message": "Training started in background — poll /ml/status for results"}


@app.get("/ml/predict")
def ml_predict(node: str = "HB_NORTH", month: int = 7, year: int = 2026):
    from ml_model import predict
    result = predict(node=node, month=month, year=year)
    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])
    return result


@app.get("/ml/importance")
def ml_importance():
    from ml_model import get_importance
    importance = get_importance()
    if not importance:
        raise HTTPException(status_code=404, detail="Model not trained yet — POST /ml/train first")
    return {"features": importance}


@app.get("/ml/scatter")
def ml_scatter():
    from ml_model import get_status
    meta = get_status()
    if not meta.get("trained"):
        raise HTTPException(status_code=404, detail="Model not trained")
    return {"scatter": meta.get("scatter_sample", [])}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8083"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
