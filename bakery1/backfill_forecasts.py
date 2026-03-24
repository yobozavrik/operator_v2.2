"""
Бекфіл прогнозів за минулі дати.
Генерує demand_forecasts для кожного дня в діапазоні,
використовуючи тільки дані які були доступні ДО тієї дати (no leakage).

Запуск:
  python bakery1/backfill_forecasts.py                        # останні 4 тижні
  python bakery1/backfill_forecasts.py 2026-03-01 2026-03-19  # свій діапазон
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

from demand_features import build_features, fetch_weather, FEATURES, TARGET

warnings.filterwarnings("ignore")

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

BREAD_MAP = {
    768: "Хліб \"Француз\"", 849: "Хліб \"Француз з цибулею\"",
    839: "Хліб \"Житньо-Пшеничний\"", 843: "Хліб \"Тартін\"",
    778: "Хліб \"Гречаний\"", 772: "Хліб \"Солодовий з журавлиною\"",
    774: "Хліб \"Злаковий\"", 780: "Хліб \"Висівковий\"",
    776: "Хліб \"Жит-Пш з льоном\"", 832: "Багет Француз",
    833: "Багет Гречаний", 837: "Багет Фітнес",
    1147: "Багет класичний", 880: "Батон",
}
SPOT_IDS = [1,2,3,4,5,6,7,8,9,12,13,14,15,16,17,18,19,20,21,22,23]


def load_all_history(supabase) -> pd.DataFrame:
    """Завантажує весь daily_oos один раз."""
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
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    for col in ["supply_qty","fresh_sold","disc_sold","writeoff_total",
                "evening_balance","demand_est"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    return df


def build_forecast_rows(forecast_date: date) -> pd.DataFrame:
    rows = []
    for spot_id in SPOT_IDS:
        for product_id, product_name in BREAD_MAP.items():
            rows.append({
                "date": pd.Timestamp(forecast_date),
                "spot_id": spot_id, "product_id": product_id,
                "product_name": product_name,
                "supply_qty": 0, "fresh_sold": 0,
                "disc_sold": 0, "writeoff_total": 0,
                "evening_balance": np.nan, "oos_final": False,
                "demand_est": np.nan,
            })
    return pd.DataFrame(rows)


def run_backfill(date_from: date, date_to: date):
    print(f"Бекфіл прогнозів: {date_from} → {date_to}")

    # Модель
    for version in ["challenger_v2", "challenger_v1"]:
        model_path = MODEL_DIR / f"{version}.pkl"
        meta_path  = MODEL_DIR / f"{version}_meta.json"
        if model_path.exists():
            break
    else:
        raise FileNotFoundError("Модель не знайдена. Запустіть train_demand_model.py")

    model = joblib.load(model_path)
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    print(f"Модель: {meta['version']}  WAPE_CV={meta['wape_cv']:.4f}")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Завантажуємо весь daily_oos один раз
    print("Завантаження daily_oos...")
    df_all_history = load_all_history(supabase)
    print(f"  {len(df_all_history)} рядків, {df_all_history['date'].min().date()} → {df_all_history['date'].max().date()}")

    # Погода для всього діапазону (з запасом)
    w_from = (date_from - timedelta(days=60))
    print(f"Завантаження погоди {w_from} → {date_to}...")
    weather_df = fetch_weather(w_from, date_to)
    print(f"  Погода: {len(weather_df)} днів")

    # Перебираємо дні
    all_dates = []
    d = date_from
    while d <= date_to:
        all_dates.append(d)
        d += timedelta(days=1)

    all_records = []
    skipped = 0

    for forecast_date in all_dates:
        # Тільки дані ДО дати прогнозу (no leakage)
        df_hist = df_all_history[
            df_all_history["date"] < pd.Timestamp(forecast_date)
        ].copy()

        if len(df_hist) == 0:
            skipped += 1
            continue

        df_fcast = build_forecast_rows(forecast_date)
        df_combined = pd.concat([df_hist, df_fcast], ignore_index=True)
        df_combined = df_combined.sort_values(["spot_id","product_id","date"]).reset_index(drop=True)

        df_combined = build_features(df_combined, weather_df)
        df_pred = df_combined[df_combined["date"] == pd.Timestamp(forecast_date)].copy()
        df_pred = df_pred.dropna(subset=["lag_1w", "trend_7d"])

        if df_pred.empty:
            skipped += 1
            continue

        preds = np.maximum(0, model.predict(df_pred[FEATURES]))
        df_pred = df_pred.copy()
        df_pred["predicted_qty"] = np.round(preds).astype(int)
        df_pred["oos_prob"]      = df_pred["oos_rate_4w"].fillna(0).clip(0, 1)

        for _, row in df_pred.iterrows():
            all_records.append({
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

        print(f"  {forecast_date}: {len(df_pred)} прогнозів")

    print(f"\nПропущено дат: {skipped}")
    print(f"Всього прогнозів: {len(all_records)}")

    if not all_records:
        print("Немає що зберігати.")
        return

    # Зберігаємо батчами по 500
    print("Збереження у demand_forecasts...")
    batch_size = 500
    for i in range(0, len(all_records), batch_size):
        batch = all_records[i:i+batch_size]
        supabase.schema("bakery1").table("demand_forecasts").upsert(
            batch, on_conflict="forecast_date,spot_id,product_id"
        ).execute()
        print(f"  Збережено {min(i+batch_size, len(all_records))}/{len(all_records)}")

    print(f"\n✓ Готово. Прогнози за {date_from} → {date_to} збережені.")


if __name__ == "__main__":
    if len(sys.argv) == 3:
        date_from = date.fromisoformat(sys.argv[1])
        date_to   = date.fromisoformat(sys.argv[2])
    else:
        # За замовчуванням: останні 4 тижні (до вчора)
        date_to   = date.today() - timedelta(days=1)
        date_from = date_to - timedelta(weeks=4)

    run_backfill(date_from, date_to)
