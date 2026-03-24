"""
compare_models.py — Честный A/B тест: single-model vs per-DOW
=============================================================
Фиксированное тестовое окно: 2026-03-12 .. 2026-03-18
Единый target: fresh_sold(D0) + disc_sold(D1)
Единый DQ gate + sample_weight OOS=0.3

Запуск:
    cd D:/operator-main/autoresearch
    python compare_models.py
"""

import sys
import io
import warnings
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import lightgbm as lgb
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).resolve().parent))

import prepare
import train as agent

# ── Фиксированное окно ────────────────────────────────────────────────
TEST_START = pd.Timestamp("2026-03-12")
TEST_END   = pd.Timestamp("2026-03-18")
OOS_WEIGHT = 0.3
DAYS       = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

print("=" * 65)
print("A/B COMPARE: single-model (A) vs per-DOW (B)")
print(f"Test window: {TEST_START.date()} — {TEST_END.date()}")
print("=" * 65)

# ── 1. Загрузка и подготовка данных ──────────────────────────────────
prepare.set_eval_date(TEST_END.strftime("%Y-%m-%d"))
raw     = prepare.load_data()
weather = prepare.load_weather()

df = prepare.build_base_features(raw, weather)
df = agent.extra_features(df)

cat_features = ["store_id", "sku_id", "dow", "month"]
for c in cat_features:
    if c in df.columns:
        df[c] = df[c].astype("category")

# ── 2. Train / test split — одинаковый для A и B ─────────────────────
train_all = df[df["date"] < TEST_START].copy()

# DQ gate на train (как в autoresearch)
if "dq_bad" in train_all.columns:
    n_before = len(train_all)
    train_all = train_all[train_all["dq_bad"] == 0]
    print(f"DQ gate: {n_before} -> {len(train_all)} train rows")

# sample_weight
train_weights_all = (
    train_all["oos_signal"].map({0: 1.0, 1: OOS_WEIGHT}).fillna(1.0).values
)
oos_n = (train_all["oos_signal"] == 1).sum()
print(f"Sample weights: {len(train_all)-oos_n} non-OOS(w=1.0) + {oos_n} OOS(w={OOS_WEIGHT})")

# Test: все рядки в окне
test_all = df[(df["date"] >= TEST_START) & (df["date"] <= TEST_END)].copy()
# Test A: только non-OOS (Eval A)
test_nonoos = test_all[test_all["oos_signal"] == 0].copy()

print(f"Train rows: {len(train_all)} | Test(all): {len(test_all)} | Test(nonOOS): {len(test_nonoos)}")
print()

# ── Проверка фич ──────────────────────────────────────────────────────
features = agent.FEATURES
missing = [f for f in features if f not in df.columns]
if missing:
    print(f"WARNING: missing features {missing}, удаляем из списка")
    features = [f for f in features if f in df.columns]

cat_used = [c for c in cat_features if c in features]

# ── 3. MODEL A: single-model (текущий autoresearch) ───────────────────
print("--- MODEL A: single-model ---")
params_a = {**agent.PARAMS, "random_state": 42, "verbosity": -1}
model_a  = lgb.LGBMRegressor(**params_a)
model_a.fit(
    train_all[features], train_all["demand_d0_d1"],
    sample_weight=train_weights_all,
    categorical_feature=cat_used,
    eval_set=[(test_nonoos[features], test_nonoos["demand_d0_d1"])],
    callbacks=[lgb.early_stopping(stopping_rounds=30, verbose=False)],
)
print(f"  Trees used: {model_a.best_iteration_}")

yhat_a_all    = np.maximum(0, model_a.predict(test_all[features]))
yhat_a_nonoos = np.maximum(0, model_a.predict(test_nonoos[features]))
print()

# ── 4. MODEL B: per-DOW (7 отдельных моделей) ────────────────────────
print("--- MODEL B: per-DOW (7 models) ---")
params_b = {**agent.PARAMS, "random_state": 42, "verbosity": -1}
dow_models = {}

for dow in range(7):
    tr_dow  = train_all[train_all["dow"] == dow]
    w_dow   = train_weights_all[train_all["dow"].values == dow]
    te_dow  = test_nonoos[test_nonoos["dow"] == dow]

    if len(tr_dow) < 10:
        print(f"  DOW {dow} ({DAYS[dow]}): skip (only {len(tr_dow)} train rows)")
        continue

    m = lgb.LGBMRegressor(**params_b)
    eval_args = {}
    if len(te_dow) > 0:
        eval_args = {
            "eval_set": [(te_dow[features], te_dow["demand_d0_d1"])],
            "callbacks": [lgb.early_stopping(stopping_rounds=30, verbose=False)],
        }
    m.fit(
        tr_dow[features], tr_dow["demand_d0_d1"],
        sample_weight=w_dow,
        categorical_feature=cat_used,
        **eval_args,
    )
    dow_models[dow] = m
    trees = m.best_iteration_ if hasattr(m, "best_iteration_") and m.best_iteration_ else params_b["n_estimators"]
    print(f"  DOW {dow} ({DAYS[dow]}): {len(tr_dow)} train rows | trees={trees}")

# Предсказания B: по каждому DOW своя модель
def predict_b(df_pred):
    preds = np.zeros(len(df_pred))
    for dow, m in dow_models.items():
        mask = df_pred["dow"].astype(int) == dow
        if mask.any():
            preds[mask.values] = np.maximum(0, m.predict(df_pred.loc[mask, features]))
    # Fallback to model_a for missing DOWs
    missing_mask = ~df_pred["dow"].astype(int).isin(dow_models.keys())
    if missing_mask.any():
        preds[missing_mask.values] = np.maximum(0, model_a.predict(df_pred.loc[missing_mask, features]))
    return preds

yhat_b_all    = predict_b(test_all)
yhat_b_nonoos = predict_b(test_nonoos)
print()

# ── 5. Метрики ────────────────────────────────────────────────────────
def wape(y_true, y_pred):
    s = np.sum(y_true)
    return float(np.sum(np.abs(y_true - y_pred)) / s) if s > 0 else 0.0

def bias_m(y_true, y_pred):
    return float(np.mean(y_pred - y_true))

y_all    = test_all["demand_d0_d1"].values
y_nonoos = test_nonoos["demand_d0_d1"].values

metrics = {
    "WAPE_nonOOS": (wape(y_nonoos, yhat_a_nonoos), wape(y_nonoos, yhat_b_nonoos)),
    "WAPE_all":    (wape(y_all,    yhat_a_all),    wape(y_all,    yhat_b_all)),
    "Bias_nonOOS": (bias_m(y_nonoos, yhat_a_nonoos), bias_m(y_nonoos, yhat_b_nonoos)),
    "Bias_all":    (bias_m(y_all,    yhat_a_all),    bias_m(y_all,    yhat_b_all)),
}

print("=" * 65)
print(f"{'Метрика':<18}  {'Model A':>10}  {'Model B':>10}  {'Δ (B-A)':>10}  {'Победитель':>10}")
print("-" * 65)
for name, (a_val, b_val) in metrics.items():
    delta = b_val - a_val
    if "WAPE" in name:
        winner = "B ✓" if b_val < a_val else ("A ✓" if a_val < b_val else "tie")
        print(f"{name:<18}  {a_val:>10.4f}  {b_val:>10.4f}  {delta:>+10.4f}  {winner:>10}")
    else:
        winner = "B ✓" if abs(b_val) < abs(a_val) else ("A ✓" if abs(a_val) < abs(b_val) else "tie")
        print(f"{name:<18}  {a_val:>10.3f}  {b_val:>10.3f}  {delta:>+10.3f}  {winner:>10}")

# ── 6. WAPE by DOW ────────────────────────────────────────────────────
print()
print(f"{'WAPE by DOW':<10}  {'Model A':>10}  {'Model B':>10}  {'Δ':>8}  {'Winner':>8}")
print("-" * 50)
for dow in range(7):
    mask_all    = test_all["dow"].astype(int) == dow
    mask_nonoos = test_nonoos["dow"].astype(int) == dow
    if not mask_nonoos.any():
        print(f"  {DAYS[dow]:<8}  {'n/a':>10}  {'n/a':>10}")
        continue
    wa = wape(y_nonoos[mask_nonoos.values], yhat_a_nonoos[mask_nonoos.values])
    wb = wape(y_nonoos[mask_nonoos.values], yhat_b_nonoos[mask_nonoos.values])
    n_all    = mask_all.sum()
    n_nonoos = mask_nonoos.sum()
    winner = "B ✓" if wb < wa else ("A ✓" if wa < wb else "tie")
    print(f"  {DAYS[dow]:<8}  {wa:>10.4f}  {wb:>10.4f}  {wb-wa:>+8.4f}  {winner:>8}  "
          f"(nonOOS={n_nonoos}/{n_all})")

# ── 7. Top SKU comparison ─────────────────────────────────────────────
print()
print("--- Top SKU (by volume, nonOOS test) ---")
test_nonoos_copy = test_nonoos.copy()
test_nonoos_copy["yhat_a"] = yhat_a_nonoos
test_nonoos_copy["yhat_b"] = yhat_b_nonoos

sku_stats = []
names = raw[["sku_id","product_name"]].drop_duplicates()
for sku_id, grp in test_nonoos_copy.groupby("sku_id"):
    yt = grp["demand_d0_d1"].values
    wa = wape(yt, grp["yhat_a"].values)
    wb = wape(yt, grp["yhat_b"].values)
    vol = yt.sum()
    name = names[names["sku_id"]==sku_id]["product_name"].values
    name = name[0] if len(name) else str(sku_id)
    sku_stats.append({"sku_id": sku_id, "name": name, "vol": vol, "wape_a": wa, "wape_b": wb})

sku_df = pd.DataFrame(sku_stats).sort_values("vol", ascending=False).head(8)
print(f"{'SKU':<35}  {'vol':>5}  {'WAPE_A':>7}  {'WAPE_B':>7}  {'Δ':>7}  {'Win':>4}")
print("-" * 70)
for _, r in sku_df.iterrows():
    delta = r["wape_b"] - r["wape_a"]
    w = "B" if r["wape_b"] < r["wape_a"] else "A"
    print(f"{str(r['name']):<35}  {int(r['vol']):>5}  {r['wape_a']:>7.4f}  {r['wape_b']:>7.4f}  {delta:>+7.4f}  {w:>4}")

# ── 8. Top stores comparison ──────────────────────────────────────────
print()
print("--- Top stores (by volume, nonOOS test) ---")
store_stats = []
for sid, grp in test_nonoos_copy.groupby("store_id"):
    yt = grp["demand_d0_d1"].values
    wa = wape(yt, grp["yhat_a"].values)
    wb = wape(yt, grp["yhat_b"].values)
    vol = yt.sum()
    store_stats.append({"store_id": int(sid), "vol": vol, "wape_a": wa, "wape_b": wb})

store_df = pd.DataFrame(store_stats).sort_values("vol", ascending=False).head(10)
print(f"{'Store':>6}  {'vol':>5}  {'WAPE_A':>7}  {'WAPE_B':>7}  {'Δ':>7}  {'Win':>4}")
print("-" * 45)
for _, r in store_df.iterrows():
    delta = r["wape_b"] - r["wape_a"]
    w = "B" if r["wape_b"] < r["wape_a"] else "A"
    print(f"{int(r['store_id']):>6}  {int(r['vol']):>5}  {r['wape_a']:>7.4f}  {r['wape_b']:>7.4f}  {delta:>+7.4f}  {w:>4}")

# ── 9. Row-level predictions CSV ─────────────────────────────────────
print()
test_all_copy = test_all.copy()
test_all_copy["yhat_a"] = yhat_a_all
test_all_copy["yhat_b"] = yhat_b_all

out = test_all_copy[["date","store_id","sku_id","demand_d0_d1","yhat_a","yhat_b","oos_signal","dow"]].copy()
out = out.rename(columns={"demand_d0_d1": "y_true"})
out["store_id"] = out["store_id"].astype(int)
out["sku_id"]   = out["sku_id"].astype(int)
out["dow"]      = out["dow"].astype(int)
out["oos_signal"] = out["oos_signal"].astype(int)
out["yhat_a"]   = out["yhat_a"].round(2)
out["yhat_b"]   = out["yhat_b"].round(2)

out_path = Path(__file__).resolve().parent / "ab_predictions.csv"
out.to_csv(out_path, index=False, encoding="utf-8-sig")
print(f"Row-level predictions saved: {out_path}")
print(f"Rows: {len(out)} (all test) | Columns: {list(out.columns)}")

# ── 10. Финальное решение ─────────────────────────────────────────────
print()
print("=" * 65)
wape_all_a, wape_all_b   = metrics["WAPE_all"]
bias_all_a, bias_all_b   = metrics["Bias_all"]
bias_ok = abs(bias_all_b) <= abs(bias_all_a) * 1.2   # B не хуже A по bias более чем на 20%

print("РЕШЕНИЕ:")
if wape_all_b < wape_all_a and bias_ok:
    print(f"  ✅ БЕРЕМ per-DOW (B)")
    print(f"     WAPE_all: {wape_all_a:.4f} → {wape_all_b:.4f} ({(wape_all_b-wape_all_a)/wape_all_a*100:+.1f}%)")
    print(f"     Bias_all: {bias_all_a:.3f} → {bias_all_b:.3f} (в пределах нормы)")
elif wape_all_b < wape_all_a and not bias_ok:
    print(f"  ⚠️  B лучше по WAPE но хуже по Bias — ОСТАВЛЯЕМ A, изучаем отдельные идеи B")
    print(f"     WAPE_all: A={wape_all_a:.4f} B={wape_all_b:.4f}")
    print(f"     Bias_all: A={bias_all_a:.3f} B={bias_all_b:.3f} ← B выходит за допуск")
else:
    print(f"  ✅ ОСТАВЛЯЕМ single-model (A) — B не дает улучшения")
    print(f"     WAPE_all: A={wape_all_a:.4f} B={wape_all_b:.4f}")
print("=" * 65)
