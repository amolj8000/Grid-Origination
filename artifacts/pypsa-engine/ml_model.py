"""
XGBoost Congestion Prediction Model
-------------------------------------
Uses monthly ercot_node_stats data to predict:
  - Regression: basis magnitude (|RT - DA|)
  - Classification: congestion event (|RT - DA| > $10)

Feature engineering from monthly historical data:
  node (label-encoded), node_type, year, month, season,
  is_peak_season, on_peak_avg, off_peak_avg, volatility,
  neg_price_pct, rolling_3m_basis, yoy_basis, avg_da_price

Train split: 2022–2024
Test split:  2025–2026
"""

import os
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    mean_absolute_error, mean_squared_error,
    accuracy_score, f1_score, precision_score, recall_score,
)
import xgboost as xgb
import joblib
from db import fetch_all

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "xgb_regression.joblib")
CLASS_PATH = os.path.join(MODEL_DIR, "xgb_classification.joblib")
ENC_PATH   = os.path.join(MODEL_DIR, "node_encoder.joblib")
META_PATH  = os.path.join(MODEL_DIR, "model_meta.joblib")

CONG_THRESHOLD = 10.0  # $/MWh


def _load_data() -> pd.DataFrame:
    """Load ercot_node_stats from DB and compute features."""
    rows = fetch_all("""
        SELECT node, node_type, year, month,
               avg_da_price::float  AS da,
               avg_rt_price::float  AS rt,
               volatility::float    AS vol,
               neg_price_percent::float AS neg_pct,
               on_peak_avg::float   AS on_peak,
               off_peak_avg::float  AS off_peak
        FROM ercot_node_stats
        WHERE avg_da_price IS NOT NULL
          AND avg_rt_price IS NOT NULL
        ORDER BY node, year, month
    """)
    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df["basis"]       = df["rt"] - df["da"]
    df["abs_basis"]   = df["basis"].abs()
    df["is_congested"] = (df["abs_basis"] > CONG_THRESHOLD).astype(int)

    # Season feature
    def season(m):
        if m in (12, 1, 2): return 0    # winter
        if m in (3, 4, 5):  return 1    # spring
        if m in (6, 7, 8):  return 2    # summer
        return 3                         # fall
    df["season"]       = df["month"].apply(season)
    df["is_peak_season"] = df["month"].apply(lambda m: int(m in (6, 7, 8, 12, 1, 2)))
    df["q"]            = ((df["month"] - 1) // 3 + 1)

    # Rolling 3-month basis per node (sorted by year, month)
    df = df.sort_values(["node", "year", "month"])
    df["rolling_3m_basis"] = (
        df.groupby("node")["basis"]
          .transform(lambda x: x.shift(1).rolling(3, min_periods=1).mean())
    )
    df["rolling_3m_basis"] = df["rolling_3m_basis"].fillna(0.0)

    # YoY basis change (same node, same month, prior year)
    yoy_key = df.set_index(["node", "year", "month"])["basis"]
    def get_yoy(row):
        try:
            return row["basis"] - yoy_key.loc[(row["node"], row["year"] - 1, row["month"])]
        except KeyError:
            return 0.0
    df["yoy_basis"] = df.apply(get_yoy, axis=1)

    df["vol"]      = df["vol"].fillna(0.0)
    df["neg_pct"]  = df["neg_pct"].fillna(0.0)
    df["on_peak"]  = df["on_peak"].fillna(df["da"])
    df["off_peak"] = df["off_peak"].fillna(df["da"])

    return df


FEATURE_COLS = [
    "node_enc", "node_type_enc", "year", "month", "season",
    "is_peak_season", "q", "da", "on_peak", "off_peak",
    "vol", "neg_pct", "rolling_3m_basis", "yoy_basis",
]

def _encode(df: pd.DataFrame, enc: LabelEncoder | None = None, node_type_enc=None):
    if enc is None:
        enc = LabelEncoder()
        df["node_enc"] = enc.fit_transform(df["node"])
    else:
        known = set(enc.classes_)
        df["node_enc"] = df["node"].apply(lambda n: enc.transform([n])[0] if n in known else -1)

    if node_type_enc is None:
        node_type_enc = LabelEncoder()
        df["node_type_enc"] = node_type_enc.fit_transform(df["node_type"])
    else:
        df["node_type_enc"] = node_type_enc.transform(df["node_type"])

    return df, enc, node_type_enc


def train() -> dict:
    """Train XGBoost regression + classification models. Returns metrics dict."""
    os.makedirs(MODEL_DIR, exist_ok=True)

    df = _load_data()
    if df.empty:
        return {"error": "No training data available in ercot_node_stats"}

    df, enc, nt_enc = _encode(df)

    train_df = df[df["year"] <= 2024].copy()
    test_df  = df[df["year"] >= 2025].copy()

    if train_df.empty or test_df.empty:
        return {"error": "Not enough data to form train/test splits"}

    X_train = train_df[FEATURE_COLS].values
    y_train_reg  = train_df["abs_basis"].values
    y_train_cls  = train_df["is_congested"].values

    X_test  = test_df[FEATURE_COLS].values
    y_test_reg   = test_df["abs_basis"].values
    y_test_cls   = test_df["is_congested"].values

    # Regression model
    reg = xgb.XGBRegressor(
        n_estimators=200, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        random_state=42, n_jobs=-1, verbosity=0,
    )
    reg.fit(X_train, y_train_reg)
    pred_reg = reg.predict(X_test)
    mae  = float(mean_absolute_error(y_test_reg, pred_reg))
    rmse = float(np.sqrt(mean_squared_error(y_test_reg, pred_reg)))

    # Classification model
    cls = xgb.XGBClassifier(
        n_estimators=200, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        scale_pos_weight=float(np.sum(y_train_cls == 0)) / max(np.sum(y_train_cls == 1), 1),
        random_state=42, n_jobs=-1, verbosity=0, eval_metric="logloss",
    )
    cls.fit(X_train, y_train_cls)
    pred_cls = cls.predict(X_test)
    acc    = float(accuracy_score(y_test_cls, pred_cls))
    f1     = float(f1_score(y_test_cls, pred_cls, zero_division=0))
    prec   = float(precision_score(y_test_cls, pred_cls, zero_division=0))
    rec    = float(recall_score(y_test_cls, pred_cls, zero_division=0))

    # Feature importance
    feat_imp = [
        {"feature": FEATURE_COLS[i], "importance": round(float(v), 4)}
        for i, v in enumerate(reg.feature_importances_)
    ]
    feat_imp.sort(key=lambda x: x["importance"], reverse=True)

    # Scatter sample for frontend
    n_sample = min(500, len(y_test_reg))
    idx = np.random.choice(len(y_test_reg), n_sample, replace=False)
    scatter = [
        {"actual": round(float(y_test_reg[i]), 2), "predicted": round(float(pred_reg[i]), 2)}
        for i in idx
    ]

    meta = {
        "n_train": len(train_df),
        "n_test": len(test_df),
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "accuracy": round(acc, 3),
        "f1": round(f1, 3),
        "precision": round(prec, 3),
        "recall": round(rec, 3),
        "feature_importance": feat_imp,
        "scatter_sample": scatter,
        "cong_threshold": CONG_THRESHOLD,
        "train_years": "≤2024",
        "test_years": "≥2025",
        "n_nodes": int(df["node"].nunique()),
        "n_features": len(FEATURE_COLS),
    }

    joblib.dump(reg,    MODEL_PATH)
    joblib.dump(cls,    CLASS_PATH)
    joblib.dump(enc,    ENC_PATH)
    joblib.dump(meta,   META_PATH)

    return meta


def get_status() -> dict:
    if os.path.exists(META_PATH):
        meta = joblib.load(META_PATH)
        return {"trained": True, **meta}
    return {"trained": False}


def predict(node: str, month: int, year: int = 2026) -> dict:
    if not os.path.exists(MODEL_PATH):
        return {"error": "Model not trained yet"}

    reg  = joblib.load(MODEL_PATH)
    cls  = joblib.load(CLASS_PATH)
    enc  = joblib.load(ENC_PATH)
    meta = joblib.load(META_PATH)

    rows = fetch_all("""
        SELECT avg_da_price::float AS da,
               on_peak_avg::float  AS on_peak,
               off_peak_avg::float AS off_peak,
               volatility::float   AS vol,
               neg_price_percent::float AS neg_pct
        FROM ercot_node_stats
        WHERE node = %s AND year = %s AND month = %s
        LIMIT 1
    """, (node, year - 1, month))

    if rows:
        r = rows[0]
        da = r["da"] or 0.0; on_peak = r["on_peak"] or da
        off_peak = r["off_peak"] or da; vol = r["vol"] or 0.0; neg_pct = r["neg_pct"] or 0.0
    else:
        da = on_peak = off_peak = 35.0; vol = 5.0; neg_pct = 0.0

    def season(m):
        if m in (12, 1, 2): return 0
        if m in (3, 4, 5):  return 1
        if m in (6, 7, 8):  return 2
        return 3

    known_nodes = list(enc.classes_)
    node_enc = int(enc.transform([node])[0]) if node in known_nodes else -1

    node_type = "hub" if node.startswith("HB") else "load_zone"
    nt_enc = 0 if node_type == "hub" else 1

    feat = np.array([[
        node_enc, nt_enc, year, month,
        season(month), int(month in (6,7,8,12,1,2)),
        (month - 1) // 3 + 1,
        da, on_peak, off_peak, vol, neg_pct,
        0.0, 0.0,  # rolling/yoy — use 0 for forward prediction
    ]])

    pred_basis = float(reg.predict(feat)[0])
    pred_prob  = float(cls.predict_proba(feat)[0][1])

    return {
        "node": node,
        "month": month,
        "year": year,
        "predicted_abs_basis": round(pred_basis, 2),
        "congestion_probability": round(pred_prob, 3),
        "is_congested": pred_basis >= CONG_THRESHOLD,
        "model_mae": meta.get("mae"),
    }


def get_importance() -> list[dict]:
    if not os.path.exists(META_PATH):
        return []
    return joblib.load(META_PATH).get("feature_importance", [])
