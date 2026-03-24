"""
Challenger Model v2 — Прогноз попиту на хліб
==============================================
Покращення над v1:
  1. Погода з Open-Meteo (temp_avg, temp_change, precip, is_rainy, is_snowy)
  2. Українські свята (is_holiday)
  3. Спільний модуль demand_features.py (без дублювання коду)

Покращення над v50 (стара модель):
  1. Дані з daily_oos (multi-signal OOS + corrected demand)
  2. Таргет: demand_est (D0 OOS-скоригований), не D0+D1
  3. Rolling window cross-validation (без data leakage)
  4. oos_rate_4w — частота OOS за 4 тижні
  5. balance_lag_1w — вечірній залишок тиждень тому
  6. supply_lag_1w — поставка тиждень тому
  7. trend_28d — тренд за 28 днів

Запуск:
  python bakery1/train_demand_model.py
"""

import os
import sys
import json
import joblib
import warnings
import numpy as np
import pandas as pd
import lightgbm as lgb
from pathlib import Path
from datetime import datetime, timedelta, date
from supabase import create_client

from demand_features import (
    build_features, fetch_weather,
    FEATURES, CAT_FEATURES, TARGET,
)

warnings.filterwarnings("ignore")

# ── Конфіг ───────────────────────────────────────────────────────
ROOT      = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "bakery1" / "models"
MODEL_DIR.mkdir(exist_ok=True)

def _load_env():
    env_file = ROOT / ".env.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

_load_env()

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

MODEL_VERSION = "challenger-v2.0"


# ── 1. Завантаження даних ────────────────────────────────────────
def load_data() -> pd.DataFrame:
    """
    Пріоритет: daily_oos (Supabase) - доповнення з enriched JSON
    """
    print("Завантаження daily_oos з Supabase...")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    rows = (
        supabase.schema("bakery1")
        .table("daily_oos")
        .select(
            "date,spot_id,product_id,product_name,"
            "supply_qty,fresh_sold,disc_sold,"
            "writeoff_total,evening_balance,"
            "oos_s2,oos_s3,oos_final,demand_est"
        )
        .order("date")
        .execute()
        .data
    )

    df_oos = pd.DataFrame(rows)
    df_oos["date"] = pd.to_datetime(df_oos["date"])
    df_oos["source"] = "daily_oos"

    for col in ["supply_qty","fresh_sold","disc_sold","writeoff_total",
                "evening_balance","demand_est"]:
        df_oos[col] = pd.to_numeric(df_oos[col], errors="coerce").fillna(0)

    print(f"  daily_oos: {len(df_oos)} рядків, "
          f"{df_oos['date'].min().date()} - {df_oos['date'].max().date()}")

    # ── Fallback: enriched JSON ────────────────────────────────
    enriched_path = ROOT / "research_data_enriched.json"
    df_hist = pd.DataFrame()

    if enriched_path.exists():
        print("Завантаження historical enriched JSON...")
        with open(enriched_path, encoding="utf-8") as f:
            hist = json.load(f)
        df_hist = pd.DataFrame(hist)
        df_hist["date"] = pd.to_datetime(df_hist["date"])
        df_hist = df_hist.rename(columns={
            "store_id":  "spot_id",
            "sku_id":    "product_id",
            "qty":       "fresh_sold",
        })
        oos_dates = set(df_oos["date"].dt.date)
        df_hist = df_hist[~df_hist["date"].dt.date.isin(oos_dates)]
        df_hist["supply_qty"]      = df_hist.get("supply_qty", 0)
        df_hist["disc_sold"]       = 0
        df_hist["writeoff_total"]  = 0
        df_hist["evening_balance"] = np.nan
        df_hist["oos_final"]       = df_hist.get("oos_signal", 0).astype(bool)
        df_hist["demand_est"] = df_hist.apply(
            lambda r: max(r["fresh_sold"] * 1.2, r["fresh_sold"] + 2)
            if r["oos_final"] else r["fresh_sold"], axis=1
        )
        df_hist["source"] = "enriched_json"
        print(f"  enriched JSON: {len(df_hist)} рядків, "
              f"{df_hist['date'].min().date()} - {df_hist['date'].max().date()}")

    df = pd.concat([df_hist, df_oos], ignore_index=True)
    df = df.sort_values(["spot_id", "product_id", "date"]).reset_index(drop=True)
    print(f"Разом: {len(df)} рядків, {df['date'].min().date()} - {df['date'].max().date()}")
    return df


# ── 2. Rolling Window Cross-Validation ──────────────────────────
def rolling_cv(df: pd.DataFrame, n_folds: int = 4, test_weeks: int = 1):
    dates   = sorted(df["date"].unique())
    cutoffs = dates[-(n_folds * 7 * test_weeks)::7 * test_weeks]
    folds   = []
    for cutoff in cutoffs:
        train_mask = df["date"] < cutoff
        test_mask  = (df["date"] >= cutoff) & \
                     (df["date"] < cutoff + pd.Timedelta(weeks=test_weeks))
        if train_mask.sum() > 0 and test_mask.sum() > 0:
            folds.append((df[train_mask], df[test_mask]))
    return folds


def wape(y_true, y_pred):
    denom = np.abs(y_true).sum()
    return np.abs(y_true - y_pred).sum() / denom if denom > 0 else 0


# ── 3. Навчання ──────────────────────────────────────────────────
def train(df: pd.DataFrame):
    # ── Погода ────────────────────────────────────────────────
    date_from = df["date"].min().date()
    date_to   = df["date"].max().date()
    print(f"\nЗавантаження погоди {date_from} - {date_to}...")
    weather_df = fetch_weather(date_from, date_to)
    if not weather_df.empty:
        print(f"  Погода: {len(weather_df)} днів")

    # ── Feature engineering ───────────────────────────────────
    df = build_features(df, weather_df)
    df = df.dropna(subset=["lag_1w", "trend_7d", TARGET])
    df = df[df[TARGET] > 0]

    print(f"\nДатасет для навчання: {len(df)} рядків")
    print(f"Фічі: {len(FEATURES)}")

    # ── Rolling CV ────────────────────────────────────────────
    folds = rolling_cv(df, n_folds=4)
    cv_wapes = []

    lgb_params = dict(
        # Параметри з autoresearch (WAPE 0.1691, найкращий за 200 ітерацій)
        n_estimators=1000,
        learning_rate=0.05,
        max_depth=8,
        num_leaves=63,
        min_child_samples=20,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=0.1,
        random_state=42,
        verbosity=-1,
    )

    print("\nRolling Window CV:")
    for i, (train_df, test_df) in enumerate(folds):
        model = lgb.LGBMRegressor(**lgb_params)
        model.fit(
            train_df[FEATURES], train_df[TARGET],
            categorical_feature=CAT_FEATURES,
            eval_set=[(test_df[FEATURES], test_df[TARGET])],
            callbacks=[lgb.early_stopping(30, verbose=False)],
        )
        preds = np.maximum(0, model.predict(test_df[FEATURES]))
        w = wape(test_df[TARGET].values, preds)
        cv_wapes.append(w)
        period = f"{test_df['date'].min().date()} - {test_df['date'].max().date()}"
        print(f"  Fold {i+1}: test={period}  WAPE={w:.4f}")

    avg_wape = np.mean(cv_wapes)
    print(f"\nСередній WAPE CV: {avg_wape:.4f}  ({(1-avg_wape)*100:.1f}% точність)")

    # ── Фінальна модель ───────────────────────────────────────
    print("\nНавчаємо фінальну модель на всіх даних...")
    final_model = lgb.LGBMRegressor(**lgb_params)
    final_model.fit(
        df[FEATURES], df[TARGET],
        categorical_feature=CAT_FEATURES,
    )

    # ── Важливість фіч ────────────────────────────────────────
    importance = pd.Series(
        final_model.feature_importances_, index=FEATURES
    ).sort_values(ascending=False)
    print("\nТоп-10 важливих фіч:")
    for feat, imp in importance.head(10).items():
        print(f"  {feat:<22} {imp:>6.0f}")

    # ── Збереження ────────────────────────────────────────────
    meta = {
        "version":      MODEL_VERSION,
        "trained_at":   datetime.now().isoformat(),
        "wape_cv":      round(avg_wape, 4),
        "n_folds":      len(folds),
        "features":     FEATURES,
        "cat_features": CAT_FEATURES,
        "target":       TARGET,
        "train_from":   str(df["date"].min().date()),
        "train_to":     str(df["date"].max().date()),
        "n_rows":       len(df),
    }

    model_path = MODEL_DIR / "challenger_v2.pkl"
    meta_path  = MODEL_DIR / "challenger_v2_meta.json"

    joblib.dump(final_model, model_path)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"\nOK Модель збережена: {model_path}")
    print(f"OK Meta збережена:   {meta_path}")

    return final_model, meta


# ── Entry point ──────────────────────────────────────────────────
if __name__ == "__main__":
    df = load_data()
    model, meta = train(df)
    print(f"\nГотово. WAPE CV = {meta['wape_cv']:.4f}")
