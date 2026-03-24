"""
predict_today.py - forecast for a target date using current autoresearch model config.
Usage: python predict_today.py 2026-03-21
"""

import os
import sys
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))

import prepare  # noqa: E402
import train as agent  # noqa: E402

TARGET_DATE = pd.Timestamp(sys.argv[1]) if len(sys.argv) > 1 else pd.Timestamp("2026-03-21")
print(f"Forecast date: {TARGET_DATE.date()} ({TARGET_DATE.day_name()})")

# Build history features up to day before target.
prepare.set_eval_date((TARGET_DATE - pd.Timedelta(days=1)).strftime("%Y-%m-%d"))
raw = prepare.load_data()
weather = prepare.load_weather()

# Train frame from full available history.
df_all = prepare.build_base_features(raw, weather)
df_all = agent.extra_features(df_all)
train_df = df_all.copy()

cat_features = ["store_id", "sku_id", "dow", "month"]
for c in cat_features:
    if c in train_df.columns:
        train_df[c] = train_df[c].astype("category")

params = {**agent.PARAMS, "random_state": 42, "verbosity": -1}
model = lgb.LGBMRegressor(**params)

# sample_weight: OOS рядки з вагою 0.3 — синхронізовано з prepare.run_experiment()
OOS_WEIGHT = 0.3
train_weights = train_df["oos_signal"].map({0: 1.0, 1: OOS_WEIGHT}).fillna(1.0).values

model.fit(
    train_df[agent.FEATURES],
    train_df["demand_d0_d1"],
    sample_weight=train_weights,
    categorical_feature=[c for c in cat_features if c in agent.FEATURES],
)
print(
    f"Model trained on {len(train_df)} rows "
    f"({train_df['date'].min().date()} - {train_df['date'].max().date()})"
)

# Build rows for target date.
lag1w_date = TARGET_DATE - pd.Timedelta(days=7)
base = raw[raw["date"] == lag1w_date][["store_id", "sku_id", "product_name"]].drop_duplicates()
if base.empty:
    print(f"No rows for {lag1w_date.date()}, fallback to all store x sku pairs")
    base = raw[["store_id", "sku_id", "product_name"]].drop_duplicates()

base = base.copy()
base["date"] = TARGET_DATE
base["demand_qty"] = 0
base["supply_qty"] = 0
base["oos_signal"] = 0
base["qty"] = 0
base["evening_balance"] = 0
base["eb_zero"] = 0

raw_ext = pd.concat([raw, base], ignore_index=True)
raw_ext = raw_ext.drop_duplicates(subset=["date", "store_id", "sku_id"], keep="last")

# Temporarily extend eval date so target row remains after base feature builder cutoff.
prepare.EVAL_LAST_DATE = TARGET_DATE

pred_src = prepare.build_base_features(raw_ext, weather)
pred_src = agent.extra_features(pred_src)
pred_df = pred_src[pred_src["date"] == TARGET_DATE].copy()
if pred_df.empty:
    print("ERROR: cannot build target date rows")
    sys.exit(1)

for c in cat_features:
    if c in pred_df.columns:
        pred_df[c] = pred_df[c].astype("category")

preds = np.maximum(0, model.predict(pred_df[agent.FEATURES]))
pred_df["forecast_d0d1"] = preds.round().astype(int)

# Buffer rule requested by business:
# +1 if chronic OOS pattern and no D1 writeoff trend.
if "oos_pattern_3w" in pred_df.columns and "writeoff_d1_3w" in pred_df.columns:
    oos_signal = pred_df["oos_pattern_3w"] >= 2
    no_writeoff = pred_df["writeoff_d1_3w"] == 0
    pred_df["oos_buffer"] = (oos_signal & no_writeoff).astype(int)
else:
    pred_df["oos_buffer"] = 0

n_oos = int((pred_df["oos_pattern_3w"] >= 2).sum()) if "oos_pattern_3w" in pred_df.columns else 0
n_applied = int(pred_df["oos_buffer"].sum())
pred_df["forecast_d0d1"] += pred_df["oos_buffer"]
print(f"OOS buffer +1 applied: {n_applied} lines (oos_pattern_3w>=2: {n_oos})")

names = raw[["sku_id", "product_name"]].drop_duplicates()
pred_df = pred_df.merge(names, on="sku_id", how="left", suffixes=("", "_y"))

result = pred_df[["store_id", "sku_id", "product_name", "forecast_d0d1", "oos_buffer"]].copy()
result = result.sort_values(["store_id", "forecast_d0d1"], ascending=[True, False])

print("\nForecast D0+D1:")
print(f"{'Store':>8}  {'Product':<35}  {'D0+D1':>6}  {'buf':>4}")
print("-" * 62)
for _, r in result.iterrows():
    buf = f"+{int(r.oos_buffer)}" if r.oos_buffer > 0 else ""
    print(f"{int(r.store_id):>8}  {str(r.product_name):<35}  {int(r.forecast_d0d1):>6}  {buf:>4}")

print(
    f"\nPositions: {len(result)} | Total units: {int(result['forecast_d0d1'].sum())} "
    f"(buffer units: {n_applied})"
)

out_csv = Path(__file__).resolve().parent / f"forecast_{TARGET_DATE.date()}.csv"
result.to_csv(out_csv, index=False, encoding="utf-8-sig")
print(f"Saved: {out_csv}")
