"""
Shared feature engineering for demand forecasting models.
Використовується в train_demand_model.py та predict_demand.py.
"""

import warnings
import numpy as np
import pandas as pd
import requests
from datetime import date, timedelta

warnings.filterwarnings("ignore")

# ── Координати (Київ — центральна точка мережі) ──────────────
# За потреби можна розширити до координат по містах
WEATHER_LAT = 50.45
WEATHER_LON = 30.52

# ── Українські свята (фіксовані дати) ────────────────────────
def _build_holidays() -> set:
    holidays = set()
    for year in range(2024, 2028):
        holidays.update([
            date(year, 1, 1),   # Новий рік
            date(year, 1, 7),   # Різдво (православне)
            date(year, 3, 8),   # День жінок
            date(year, 5, 1),   # День праці
            date(year, 6, 28),  # День Конституції
            date(year, 7, 15),  # День Державності (з 2022)
            date(year, 8, 24),  # День Незалежності
            date(year, 10, 14), # День захисників
            date(year, 12, 25), # Різдво (католицьке/нове)
        ])
    # Великдень (Пасха) — перехідна дата
    EASTER = [
        date(2024, 5, 5),
        date(2025, 4, 20),
        date(2026, 4, 5),
        date(2027, 4, 25),
    ]
    holidays.update(EASTER)
    return holidays

HOLIDAYS: set = _build_holidays()


# ── Погода з Open-Meteo ───────────────────────────────────────
def fetch_weather(date_from: date, date_to: date) -> pd.DataFrame:
    """
    Завантажує денну погоду (температура, опади) з Open-Meteo.
    Для минулих дат — архів, для майбутніх — прогноз.
    Повертає DataFrame з колонками: date, temp_avg, temp_change, precip, is_rainy, is_snowy
    """
    today = date.today()
    frames = []

    # Архівні дані (до вчора включно)
    hist_end = min(date_to, today - timedelta(days=1))
    if date_from <= hist_end:
        url = "https://archive-api.open-meteo.com/v1/archive"
        params = dict(
            latitude=WEATHER_LAT,
            longitude=WEATHER_LON,
            start_date=date_from.isoformat(),
            end_date=hist_end.isoformat(),
            daily="temperature_2m_max,temperature_2m_min,precipitation_sum",
            timezone="Europe/Kyiv",
        )
        try:
            r = requests.get(url, params=params, timeout=15)
            r.raise_for_status()
            d = r.json()["daily"]
            frames.append(pd.DataFrame({
                "date":   pd.to_datetime(d["time"]),
                "t_max":  d["temperature_2m_max"],
                "t_min":  d["temperature_2m_min"],
                "precip": d["precipitation_sum"],
            }))
        except Exception as e:
            print(f"  [WARN] Архів погоди недоступний: {e}")

    # Прогноз погоди (від сьогодні)
    fcast_start = max(date_from, today)
    if fcast_start <= date_to:
        url = "https://api.open-meteo.com/v1/forecast"
        params = dict(
            latitude=WEATHER_LAT,
            longitude=WEATHER_LON,
            start_date=fcast_start.isoformat(),
            end_date=date_to.isoformat(),
            daily="temperature_2m_max,temperature_2m_min,precipitation_sum",
            timezone="Europe/Kyiv",
        )
        try:
            r = requests.get(url, params=params, timeout=15)
            r.raise_for_status()
            d = r.json()["daily"]
            frames.append(pd.DataFrame({
                "date":   pd.to_datetime(d["time"]),
                "t_max":  d["temperature_2m_max"],
                "t_min":  d["temperature_2m_min"],
                "precip": d["precipitation_sum"],
            }))
        except Exception as e:
            print(f"  [WARN] Прогноз погоди недоступний: {e}")

    if not frames:
        print("  [WARN] Погода недоступна — фічі будуть NaN (модель впорається через медіани)")
        return pd.DataFrame(columns=["date","temp_avg","temp_change","precip","is_rainy","is_snowy"])

    df = pd.concat(frames, ignore_index=True).drop_duplicates("date")
    df["temp_avg"]    = (df["t_max"] + df["t_min"]) / 2
    df["temp_change"] = df["temp_avg"].diff().fillna(0)
    df["precip"]      = df["precip"].fillna(0)
    df["is_rainy"]    = ((df["precip"] > 2) & (df["temp_avg"] >= 2)).astype(int)
    df["is_snowy"]    = ((df["precip"] > 1) & (df["temp_avg"] < 2)).astype(int)

    return df[["date","temp_avg","temp_change","precip","is_rainy","is_snowy"]]


# ── Feature Engineering ───────────────────────────────────────
def build_features(df: pd.DataFrame, weather_df: pd.DataFrame | None = None) -> pd.DataFrame:
    df = df.copy()

    # ── Календар ──────────────────────────────────────────────
    df["dow"]          = df["date"].dt.dayofweek       # 0=Пн, 6=Нд
    df["week"]         = df["date"].dt.isocalendar().week.astype(int)
    df["month"]        = df["date"].dt.month
    df["day"]          = df["date"].dt.day
    df["is_weekend"]   = df["dow"].isin([5, 6]).astype(int)
    df["is_month_end"] = (df["day"] >= 25).astype(int)
    df["is_payday"]    = df["day"].isin([1, 2, 15, 16, 30, 31]).astype(int)
    df["is_holiday"]   = df["date"].dt.date.isin(HOLIDAYS).astype(int)

    # ── Погода (merge по даті) ────────────────────────────────
    if weather_df is not None and not weather_df.empty:
        df = df.merge(weather_df, on="date", how="left")
    else:
        for col in ["temp_avg","temp_change","precip","is_rainy","is_snowy"]:
            df[col] = np.nan

    # Заповнюємо пропуски погоди медіаною по місяцю (сезонна апроксимація)
    for col in ["temp_avg","temp_change","precip","is_rainy","is_snowy"]:
        month_median = df.groupby("month")[col].transform("median")
        df[col] = df[col].fillna(month_median).fillna(0)

    # ── Лагові фічі (по тижню) ────────────────────────────────
    base = "demand_est"

    g_dow  = df.groupby(["spot_id", "product_id", "dow"])[base]
    g_full = df.groupby(["spot_id", "product_id"])[base]
    g_sku  = df.groupby(["product_id", "dow"])[base]

    df["lag_1w"]    = g_dow.shift(1)
    df["lag_2w"]    = g_dow.shift(2)
    df["lag_3w"]    = g_dow.shift(3)
    df["ma_dow_3w"] = g_dow.transform(
        lambda x: x.shift(1).rolling(3, min_periods=1).mean()
    )

    df["trend_7d"]  = g_full.transform(
        lambda x: x.shift(1).rolling(7,  min_periods=1).mean()
    )
    df["trend_14d"] = g_full.transform(
        lambda x: x.shift(1).rolling(14, min_periods=1).mean()
    )
    df["trend_28d"] = g_full.transform(
        lambda x: x.shift(1).rolling(28, min_periods=1).mean()
    )

    # Мережевий профіль SKU по дню тижня
    df["sku_dow_ma3"] = g_sku.transform(
        lambda x: x.shift(1).rolling(3, min_periods=1).mean()
    )

    # ── OOS фічі ─────────────────────────────────────────────
    df["oos_int"]     = df["oos_final"].fillna(False).astype(int)
    df["oos_lag_1w"]  = (
        df.groupby(["spot_id", "product_id", "dow"])["oos_int"]
        .shift(1).fillna(0)
    )
    df["oos_rate_4w"] = df.groupby(["spot_id", "product_id"])["oos_int"].transform(
        lambda x: x.shift(1).rolling(28, min_periods=1).mean()
    )

    # ── Залишок і поставка (тиждень тому) ────────────────────
    df["balance_lag_1w"] = df.groupby(
        ["spot_id", "product_id", "dow"]
    )["evening_balance"].shift(1)

    df["supply_lag_1w"] = df.groupby(
        ["spot_id", "product_id", "dow"]
    )["supply_qty"].shift(1)

    # ── Store-level lag (загальний обсяг точки вчора) ─────────
    store_vol = df.groupby(["spot_id", "date"])["demand_est"].sum().reset_index()
    store_vol.columns = ["spot_id", "date", "store_vol"]
    store_vol["store_lag1d"] = store_vol.groupby("spot_id")["store_vol"].shift(1)
    df = df.merge(store_vol[["spot_id", "date", "store_lag1d"]], on=["spot_id", "date"], how="left")

    # ── 2d-фічі (safe date-merge, без shift по рядках) ────────
    # Допоміжна функція: взяти значення n_days назад через join по даті
    def _date_lag(src_df, n_days, src_col, new_col, grp_cols):
        tmp = src_df[grp_cols + ["date", src_col]].copy()
        tmp["date"] = tmp["date"] + pd.Timedelta(days=n_days)
        return src_df.merge(
            tmp.rename(columns={src_col: new_col}),
            on=grp_cols + ["date"], how="left"
        )

    grp = ["spot_id", "product_id"]

    # demand(D-6) → lag_6d
    df = _date_lag(df, 6,  "demand_est",   "lag_6d",  grp)
    # demand(D-13)
    df = _date_lag(df, 13, "demand_est",   "lag_13d", grp)
    # demand(D-20)
    df = _date_lag(df, 20, "demand_est",   "lag_20d", grp)
    # supply(D-6)
    df = _date_lag(df, 6,  "supply_qty",   "supply_6d", grp)
    # ma_dow_3w(D+1) — скользящее среднее следующего дня DOW
    df = _date_lag(df, -1, "ma_dow_3w",    "ma_dow_3w_d1", grp)

    # 2-дневные суммы
    df["lag_2d"]        = df["lag_1w"].fillna(0) + df["lag_6d"].fillna(0)
    df["lag_14d_2d"]    = df["lag_2w"].fillna(0) + df["lag_13d"].fillna(0)
    df["lag_21d_2d"]    = df["lag_3w"].fillna(0) + df["lag_20d"].fillna(0)
    df["ma3_2d"]        = df["ma_dow_3w"].fillna(0) + df["ma_dow_3w_d1"].fillna(df["ma_dow_3w"].fillna(0))
    df["supply_2d_lag1w"] = df["supply_lag_1w"].fillna(0) + df["supply_6d"].fillna(0)

    # Производные 2d-фичи
    df["lag_diff"]      = df["lag_2d"] - df["lag_14d_2d"]
    df["demand_estimate"] = df["lag_2d"] * (1 + df["oos_rate_4w"].fillna(0))
    df["relative_ma3"]  = df["ma_dow_3w"] / (df["trend_7d"] + 1)
    df["sku_store_ratio"] = df["trend_7d"] / (df["store_lag1d"].fillna(1) + 1)
    df["lag_2d_norm"]   = df["lag_2d"] / (df["ma3_2d"] + 1)

    # ── Таргет D0+D1 (безпечний merge по даті) ────────────────
    df = _date_lag(df, -1, "demand_est", "demand_next", grp)
    df["demand_d0_d1"] = df["demand_est"] + df["demand_next"].fillna(0)

    return df


# ── Списки фіч ───────────────────────────────────────────────
FEATURES = [
    # Ідентифікація
    "spot_id", "product_id",
    # Календар
    "dow", "month", "is_weekend", "day", "is_month_end", "is_payday", "is_holiday",
    # Лаги та тренди (одиночні)
    "lag_1w", "lag_2w", "ma_dow_3w",
    "trend_7d", "trend_14d", "trend_28d",
    "sku_dow_ma3",
    # 2d-фічі (ключове відкриття autoresearch)
    "lag_2d", "lag_14d_2d", "lag_21d_2d",
    "ma3_2d", "lag_diff",
    "demand_estimate", "relative_ma3",
    "supply_2d_lag1w", "sku_store_ratio", "lag_2d_norm",
    # OOS
    "oos_lag_1w", "oos_rate_4w",
    # Залишок і поставка
    "balance_lag_1w", "supply_lag_1w",
    # Store-level
    "store_lag1d",
    # Погода
    "temp_avg", "temp_change", "precip", "is_rainy", "is_snowy",
]

CAT_FEATURES = ["spot_id", "product_id", "dow", "month"]
TARGET       = "demand_d0_d1"   # D0+D1 — портовано з autoresearch (WAPE 0.1691)
