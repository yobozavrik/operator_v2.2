"""
Inference: Challenger Model v2 — Прогноз попиту на хліб
=========================================================
Генерує прогнози на завтра (або вказану дату) і зберігає в demand_forecasts.

Запуск:
  python bakery1/predict_demand.py              # прогноз на завтра
  python bakery1/predict_demand.py 2026-03-25   # прогноз на конкретну дату
"""

import os
import sys
import json
import joblib
import warnings
import numpy as np
import pandas as pd
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

# ── SKU / Store довідники ─────────────────────────────────────
BREAD_MAP = {
    768:  "Хліб \"Француз\"",
    849:  "Хліб \"Француз з цибулею\"",
    839:  "Хліб \"Житньо-Пшеничний\"",
    843:  "Хліб \"Тартін\"",
    778:  "Хліб \"Гречаний\"",
    772:  "Хліб \"Солодовий з журавлиною\"",
    774:  "Хліб \"Злаковий\"",
    780:  "Хліб \"Висівковий\"",
    776:  "Хліб \"Жит-Пш з льоном\"",
    832:  "Багет Француз",
    833:  "Багет Гречаний",
    837:  "Багет Фітнес",
    1147: "Багет класичний",
    880:  "Батон",
}

SPOT_IDS = [1,2,3,4,5,6,7,8,9,12,13,14,15,16,17,18,19,20,21,22,23]


# ── 1. Завантаження history ───────────────────────────────────
def load_history(supabase, forecast_date: date, lookback_days: int = 60) -> pd.DataFrame:
    date_from = (forecast_date - timedelta(days=lookback_days)).isoformat()
    date_to   = (forecast_date - timedelta(days=1)).isoformat()

    print(f"  Завантаження history {date_from} - {date_to}...")
    rows = (
        supabase.schema("bakery1")
        .table("daily_oos")
        .select(
            "date,spot_id,product_id,product_name,"
            "supply_qty,fresh_sold,disc_sold,"
            "writeoff_total,evening_balance,"
            "oos_s2,oos_s3,oos_final,demand_est"
        )
        .gte("date", date_from)
        .lte("date", date_to)
        .order("date")
        .execute()
        .data
    )

    if not rows:
        raise RuntimeError("Немає historical даних. Запустіть backfill.")

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    for col in ["supply_qty","fresh_sold","disc_sold","writeoff_total",
                "evening_balance","demand_est"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    print(f"  Завантажено {len(df)} рядків history")
    return df


# ── 2. Synthetic rows для дати прогнозу ──────────────────────
def build_forecast_rows(forecast_date: date) -> pd.DataFrame:
    rows = []
    for spot_id in SPOT_IDS:
        for product_id, product_name in BREAD_MAP.items():
            rows.append({
                "date":             pd.Timestamp(forecast_date),
                "spot_id":          spot_id,
                "product_id":       product_id,
                "product_name":     product_name,
                "supply_qty":       0,
                "fresh_sold":       0,
                "disc_sold":        0,
                "writeoff_total":   0,
                "evening_balance":  np.nan,
                "oos_final":        False,
                "demand_est":       np.nan,
            })
    return pd.DataFrame(rows)


# ── 3. Запуск прогнозу ────────────────────────────────────────
def predict(forecast_date: date):
    print(f"\nПрогноз на {forecast_date}")
    print("=" * 50)

    # Завантаження моделі (шукає v2, fallback на v1)
    for version in ["challenger_v2", "challenger_v1"]:
        model_path = MODEL_DIR / f"{version}.pkl"
        meta_path  = MODEL_DIR / f"{version}_meta.json"
        if model_path.exists():
            break
    else:
        raise FileNotFoundError(
            f"Модель не знайдена в {MODEL_DIR}\n"
            "Запустіть: python bakery1/train_demand_model.py"
        )

    model = joblib.load(model_path)
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)

    print(f"  Модель: {meta['version']}  WAPE_CV={meta['wape_cv']:.4f}")
    print(f"  Навчена на: {meta['train_from']} - {meta['train_to']}")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # History
    df_hist  = load_history(supabase, forecast_date, lookback_days=60)
    df_fcast = build_forecast_rows(forecast_date)

    df_all = pd.concat([df_hist, df_fcast], ignore_index=True)
    df_all = df_all.sort_values(["spot_id", "product_id", "date"]).reset_index(drop=True)

    # Погода (60 днів history + день прогнозу)
    w_date_from = (forecast_date - timedelta(days=60))
    print(f"\nЗавантаження погоди {w_date_from} - {forecast_date}...")
    weather_df = fetch_weather(w_date_from, forecast_date)
    if not weather_df.empty:
        print(f"  Погода: {len(weather_df)} днів")

    # Feature engineering
    df_all = build_features(df_all, weather_df)

    # Тільки forecast_date
    df_pred = df_all[df_all["date"] == pd.Timestamp(forecast_date)].copy()
    df_pred = df_pred.dropna(subset=["lag_1w", "trend_7d"])

    if df_pred.empty:
        raise RuntimeError(
            "Недостатньо historical даних.\n"
            "Потрібно мінімум 7 днів history в daily_oos."
        )

    print(f"  Рядків для прогнозу: {len(df_pred)}")

    # Прогноз
    X = df_pred[FEATURES]
    preds = np.maximum(0, model.predict(X))
    df_pred = df_pred.copy()
    df_pred["predicted_qty"] = np.round(preds).astype(int)
    df_pred["oos_prob"]      = df_pred["oos_rate_4w"].fillna(0).clip(0, 1)

    print(f"\nТоп-10 прогнозів:")
    print(df_pred[["spot_id","product_id","product_name","predicted_qty","oos_prob"]]
          .sort_values("predicted_qty", ascending=False)
          .head(10)
          .to_string(index=False))

    # ── Запис у demand_forecasts ──────────────────────────────
    records = []
    for _, row in df_pred.iterrows():
        records.append({
            "forecast_date":  forecast_date.isoformat(),
            "spot_id":        int(row["spot_id"]),
            "product_id":     int(row["product_id"]),
            "product_name":   str(row["product_name"]),
            "predicted_qty":  float(row["predicted_qty"]),
            "predicted_d0":   float(row["predicted_qty"]),
            "predicted_d1":   None,
            "model_version":  meta["version"],
            "wape_cv":        meta["wape_cv"],
            "oos_prob":       round(float(row["oos_prob"]), 4),
        })

    print(f"\nЗбереження {len(records)} прогнозів у demand_forecasts...")
    (
        supabase.schema("bakery1")
        .table("demand_forecasts")
        .upsert(records, on_conflict="forecast_date,spot_id,product_id")
        .execute()
    )
    print(f"✓ Збережено. Дата прогнозу: {forecast_date}")

    return df_pred


# ── Entry point ──────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            forecast_date = date.fromisoformat(sys.argv[1])
        except ValueError:
            print(f"Невірний формат дати: {sys.argv[1]}\nВикористовуйте: YYYY-MM-DD")
            sys.exit(1)
    else:
        forecast_date = date.today() + timedelta(days=2)

    predict(forecast_date)
