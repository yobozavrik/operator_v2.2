"""
prepare.py — Fixed infrastructure (agent NEVER modifies this file)
===================================================================
Data loading, base feature engineering, WAPE evaluation.

Run standalone to check baseline:
  cd autoresearch
  python prepare.py
"""

import os
import sys
import json
import importlib
import traceback
import numpy as np
import pandas as pd
import lightgbm as lgb
from datetime import timedelta
from pathlib import Path

ROOT         = Path(__file__).resolve().parent.parent  # D:/operator-main/
DATA_FILE    = ROOT / "research_data_enriched.json"
WEATHER_FILE = ROOT / "research_weather.json"

# ── Evaluation window — можно задать через set_eval_date() или --date в run.py
# EVAL_LAST_DATE — последний день теста. D1 для него должен быть в данных.
# Например: --date 2026-03-15 → тест 2026-03-09..2026-03-15 (D1=16 есть)
#            --date 2026-03-18 → тест 2026-03-12..2026-03-18 (D1=19 есть)
EVAL_LAST_DATE  = pd.Timestamp("2026-03-18")
EVAL_TEST_START = EVAL_LAST_DATE - timedelta(days=6)


def set_eval_date(date_str: str):
    """Установить дату конца тестового окна. Вызывается из run.py до run_experiment()."""
    global EVAL_LAST_DATE, EVAL_TEST_START
    EVAL_LAST_DATE  = pd.Timestamp(date_str)
    EVAL_TEST_START = EVAL_LAST_DATE - timedelta(days=6)
    print(f"  Eval window: {EVAL_TEST_START.date()} - {EVAL_LAST_DATE.date()}")


# ── Data loading ──────────────────────────────────────────────────────
def _load_supabase() -> pd.DataFrame:
    """Загружает данные из bakery1.daily_oos (Supabase) — источник правды."""
    try:
        env_file = ROOT / ".env.local"
        env = {}
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
        url = env.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = env.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            return pd.DataFrame()
        from supabase import create_client
        sb = create_client(url, key)
        rows = (sb.schema("bakery1").table("daily_oos")
                .select("date,spot_id,product_id,product_name,supply_qty,fresh_sold,disc_sold,writeoff_total,writeoff_direct,writeoff_movement,evening_balance,demand_est,oos_final")
                .order("date").execute().data)
        if not rows:
            return pd.DataFrame()
        df = pd.DataFrame(rows)
        df["date"]             = pd.to_datetime(df["date"])
        df["store_id"]         = df["spot_id"].astype(int)
        df["sku_id"]           = df["product_id"].astype(int)
        df["demand_qty"]       = pd.to_numeric(df["demand_est"],       errors="coerce").fillna(0)
        df["supply_qty"]       = pd.to_numeric(df["supply_qty"],       errors="coerce").fillna(0)
        df["disc_sold"]        = pd.to_numeric(df["disc_sold"],        errors="coerce").fillna(0)
        df["writeoff_total"]   = pd.to_numeric(df["writeoff_total"],   errors="coerce").fillna(0)
        df["writeoff_direct"]  = pd.to_numeric(df.get("writeoff_direct"), errors="coerce").fillna(0)
        df["writeoff_movement"]= pd.to_numeric(df.get("writeoff_movement"), errors="coerce").fillna(0)
        df["evening_balance"]  = pd.to_numeric(df["evening_balance"],  errors="coerce").fillna(0)
        df["oos_signal"]       = df["oos_final"].astype(int)
        df["qty"]              = (pd.to_numeric(df["fresh_sold"], errors="coerce").fillna(0)
                                  + df["disc_sold"])
        # OOS-сигнал: остаток на 21:30 D0 = остаток на утро D1
        # Если evening_balance=0 → D1 получил 0, хлеб закончился ещё в D0 → OOS
        df["eb_zero"] = (df["evening_balance"] <= 0).astype(int)
        df["fresh_sold"] = pd.to_numeric(df["fresh_sold"], errors="coerce").fillna(0)
        # DQ flags — до агрегации, на уровне строки
        df["dq_neg_eb"]       = (df["evening_balance"] < 0).astype(int)
        df["dq_fresh_gt_sup"] = (df["fresh_sold"] > df["supply_qty"]).astype(int)
        df["dq_bad"] = ((df["dq_neg_eb"] == 1) | (df["dq_fresh_gt_sup"] == 1)).astype(int)
        df = (df.groupby(["date","store_id","sku_id","product_name"])
                .agg(qty=("qty","sum"), supply_qty=("supply_qty","sum"),
                     oos_signal=("oos_signal","max"), demand_qty=("demand_qty","sum"),
                     evening_balance=("evening_balance","sum"),
                     eb_zero=("eb_zero","max"),
                     dq_bad=("dq_bad","max"),
                     fresh_sold=("fresh_sold","sum"),
                     disc_sold=("disc_sold","sum"),
                     writeoff_total=("writeoff_total","sum"),
                     writeoff_direct=("writeoff_direct","sum"),
                     writeoff_movement=("writeoff_movement","sum"))
                .reset_index())
        n_bad = df["dq_bad"].sum()
        print(f"  DQ: {n_bad} bad rows ({100*n_bad/len(df):.1f}%) — neg_eb or fresh>supply")
        print(f"  Supabase daily_oos: {len(df)} rows, "
              f"{df['date'].min().date()} - {df['date'].max().date()}")
        return df
    except Exception as e:
        print(f"  Supabase load failed: {e}")
        return pd.DataFrame()


def load_data() -> pd.DataFrame:
    """
    Только Supabase daily_oos — данные с реальными остатками и OOS сигналами.
    Загружаем до EVAL_LAST_DATE+1 чтобы D1 последнего тестового дня был в данных.
    Фильтр до EVAL_LAST_DATE применяется ПОСЛЕ построения D0+D1 в build_base_features.
    """
    df = _load_supabase()
    if df.empty:
        raise RuntimeError("Supabase daily_oos пустой — проверь подключение")
    # +1 день чтобы D1 для EVAL_LAST_DATE был доступен при построении таргета
    df = df[df["date"] <= EVAL_LAST_DATE + pd.Timedelta(days=1)]
    df = df.sort_values(["store_id","sku_id","date"]).reset_index(drop=True)
    print(f"  Data: {len(df)} rows, "
          f"{df['date'].min().date()} - {df['date'].max().date()}")
    return df


def load_weather() -> pd.DataFrame:
    if not WEATHER_FILE.exists():
        return pd.DataFrame()
    with open(WEATHER_FILE, encoding="utf-8") as f:
        w = pd.DataFrame(json.load(f))
    w["date"] = pd.to_datetime(w["date"])
    return w


# ── Base features (agent cannot change these) ─────────────────────────
def _reindex_continuous(df: pd.DataFrame) -> pd.DataFrame:
    """
    Reindex each (store_id, sku_id) group to a continuous date range,
    filling gaps with NaN. This ensures that .shift(N) always means
    exactly N calendar days, not N rows.
    """
    date_range = pd.date_range(df["date"].min(), df["date"].max(), freq="D")
    groups = []
    for (store_id, sku_id), grp in df.groupby(["store_id", "sku_id"]):
        grp = grp.set_index("date").reindex(date_range)
        grp["store_id"] = store_id
        grp["sku_id"]   = sku_id
        # product_name: forward-fill from real rows
        if "product_name" in grp.columns:
            grp["product_name"] = grp["product_name"].ffill().bfill()
        grp.index.name = "date"
        grp = grp.reset_index()
        groups.append(grp)
    out = pd.concat(groups, ignore_index=True)
    # Mark artificially added rows so we can drop them from train/test later
    out["_real"] = out["demand_qty"].notna()
    out["demand_qty"]      = out["demand_qty"].fillna(0)
    out["qty"]             = out["qty"].fillna(0)
    out["oos_signal"]      = out["oos_signal"].fillna(0)
    out["disc_sold"]       = out["disc_sold"].fillna(0)
    out["fresh_sold"]      = out.get("fresh_sold", pd.Series(0, index=out.index)).fillna(0)
    out["writeoff_total"]  = out["writeoff_total"].fillna(0)
    out["writeoff_direct"] = out.get("writeoff_direct", pd.Series(0, index=out.index)).fillna(0)
    out["writeoff_movement"]= out.get("writeoff_movement", pd.Series(0, index=out.index)).fillna(0)
    return out


def build_base_features(df: pd.DataFrame, weather_df: pd.DataFrame) -> pd.DataFrame:
    # Reindex to continuous dates — fixes .shift(N) on gapped data
    df = _reindex_continuous(df)
    df = df.sort_values(["store_id", "sku_id", "date"]).copy()

    # Calendar
    df["dow"]          = df["date"].dt.dayofweek
    df["month"]        = df["date"].dt.month
    df["day"]          = df["date"].dt.day
    df["is_weekend"]   = df["dow"].isin([5, 6]).astype(int)
    df["is_holiday"]   = df["date"].dt.strftime("%Y-%m-%d").isin([
        "2025-01-01","2025-01-07","2025-03-08","2025-04-20","2025-05-01",
        "2025-06-28","2025-07-15","2025-08-24","2025-10-14","2025-12-25",
        "2026-01-01","2026-01-07","2026-04-05","2026-05-01","2026-06-28",
    ]).astype(int)
    df["is_payday"]    = df["day"].isin([1, 2, 15, 16, 30, 31]).astype(int)
    df["is_month_end"] = (df["day"] >= 25).astype(int)
    df["week_of_year"] = df["date"].dt.isocalendar().week.astype(int)

    # ── TARGET: fresh_sold(D0) + disc_sold(D1) = реальне споживання ─────────────
    _disc_d1 = (df[["store_id","sku_id","date","disc_sold"]].copy()
                .assign(date=lambda x: x["date"] - pd.Timedelta(days=1))
                .rename(columns={"disc_sold": "disc_sold_d1"}))
    df = df.merge(_disc_d1, on=["store_id","sku_id","date"], how="left")
    df["disc_sold_d1"] = df["disc_sold_d1"].fillna(0)
    df["demand_d0_d1"] = (df["fresh_sold"].fillna(0) + df["disc_sold_d1"]).clip(lower=0)

    g  = df.groupby(["store_id", "sku_id"])
    gd = df.groupby(["store_id", "sku_id", "dow"])

    # Lags: exactly 7 / 14 / 21 calendar days (correct after reindex)
    df["lag1w"] = g["demand_qty"].shift(7)
    df["lag2w"] = g["demand_qty"].shift(14)
    df["lag3w"] = g["demand_qty"].shift(21)

    # Moving averages by day-of-week
    df["ma3_dow"]        = gd["demand_qty"].transform(lambda x: x.shift(1).rolling(3, min_periods=1).mean())
    df["global_sku_ma3"] = df.groupby(["sku_id", "dow"])["demand_qty"].transform(lambda x: x.shift(1).rolling(3, min_periods=1).mean())

    # Trend windows
    df["trend_7d"]  = g["demand_qty"].transform(lambda x: x.shift(1).rolling(7,  min_periods=1).mean())
    df["trend_14d"] = g["demand_qty"].transform(lambda x: x.shift(1).rolling(14, min_periods=1).mean())
    df["trend_28d"] = g["demand_qty"].transform(lambda x: x.shift(1).rolling(28, min_periods=1).mean())

    # OOS / supply lags
    df["oos_lag1w"]    = gd["oos_signal"].shift(1).fillna(0)
    df["oos_rate_4w"]  = g["oos_signal"].transform(lambda x: x.shift(1).rolling(28, min_periods=1).mean())
    # Historical OOS propensity for SKU x DOW (strictly past-only to avoid leakage)
    df["dow_oos_rate"] = df.groupby(["sku_id", "dow"])["oos_signal"].transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean()
    )
    # Fallback to DOW-level history for early rows with no SKU-specific history
    dow_oos_fallback = df.groupby(["dow"])["oos_signal"].transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean()
    )
    df["dow_oos_rate"] = df["dow_oos_rate"].fillna(dow_oos_fallback).fillna(0)
    df["supply_lag1w"] = g["supply_qty"].shift(7).fillna(0)

    # ── 2D-признаки (ключевое: таргет D0+D1, лаги тоже должны быть 2-дневными) ──
    # lag_6d: спрос 6 дней назад = D1 той же пары неделю назад
    df["lag_6d"]  = g["demand_qty"].shift(6).fillna(0)
    df["lag_13d"] = g["demand_qty"].shift(13).fillna(0)
    df["lag_20d"] = g["demand_qty"].shift(20).fillna(0)

    # 2-дневные суммы: D0+D1 за 1/2/3 недели назад
    df["lag_2d"]     = df["lag1w"].fillna(0)  + df["lag_6d"]   # прошлая неделя D0+D1
    df["lag_14d_2d"] = df["lag2w"].fillna(0)  + df["lag_13d"]  # две недели D0+D1
    df["lag_21d_2d"] = df["lag3w"].fillna(0)  + df["lag_20d"]  # три недели D0+D1

    # ma3_2d: среднее 2-дневного окна (D0 + D1 по тому же DOW)
    # D1 ma3_dow получаем через date-merge (безопасно — ma3_dow уже лагирован)
    _d1 = (df[["store_id","sku_id","date","ma3_dow"]]
           .assign(date=lambda x: x["date"] - pd.Timedelta(days=1))
           .rename(columns={"ma3_dow": "ma3_dow_d1"}))
    df = df.merge(_d1, on=["store_id","sku_id","date"], how="left")
    df["ma3_2d"] = df["ma3_dow"].fillna(0) + df["ma3_dow_d1"].fillna(df["ma3_dow"].fillna(0))

    # 2-дневная поставка (D0+D1 неделю назад)
    df["supply_6d"]      = g["supply_qty"].shift(6).fillna(0)
    df["supply_2d_lag1w"] = df["supply_lag1w"].fillna(0) + df["supply_6d"]

    # OOS-скорректированная оценка спроса
    df["demand_estimate"] = df["lag_2d"] * (1 + df["oos_rate_4w"].fillna(0))

    # Produce hybrid safe features tracking artificial discount inflation
    # expanding quantile 0.95 to maintain strictly anti-leak behavior while achieving winsorization
    demand_d0_d1_p95 = g["demand_d0_d1"].transform(lambda x: x.expanding().quantile(0.95)).fillna(df["demand_d0_d1"])
    df["demand_d0_d1_clipped"] = df["demand_d0_d1"].clip(upper=demand_d0_d1_p95)
    df["demand_d0_d1_lag1w_clipped"] = df.groupby(["store_id", "sku_id"])["demand_d0_d1_clipped"].shift(7).fillna(0)
    
    df["discount_share"] = df["disc_sold_d1"] / (df["demand_d0_d1"] + 1.0)
    df["discount_share_lag1w"] = df.groupby(["store_id", "sku_id"])["discount_share"].shift(7).fillna(0)

    # Производные признаки
    df["lag_diff"]    = df["lag_2d"] - df["lag_14d_2d"]           # направление тренда
    df["lag_2d_norm"] = df["lag_2d"] / (df["ma3_2d"] + 1)        # нормализованный лаг
    df["relative_ma3"] = df["ma3_dow"] / (df["trend_7d"] + 1)    # относит. позиция DOW

    # ── OOS-паттерн: остаток 21:30 D0 = остаток на утро D1 ──────────────
    # Если за 2 из 3 последних одинаковых DOW evening_balance=0 → хронический OOS
    gdow = df.sort_values("date").groupby(["store_id", "sku_id", "dow"])
    df["oos_pattern_3w"]  = (gdow["eb_zero"]
                             .transform(lambda x: x.shift(1).rolling(3, min_periods=1).sum())
                             .fillna(0).astype(int))
    # Остаток неделю назад (тот же DOW): сколько перешло в D1 в прошлый раз
    df["balance_lag_1w"] = gdow["evening_balance"].shift(1).fillna(0)

    # ── d1_zero_count_3w: дискаунт+списание Д1 = 0 в >=2 из 3 последних пар ──
    # disc_sold(D1) + writeoff_total(D1) = то что пришло с вечера D0 в дискаунт/списание
    # Если 0 → либо OOS на D0 (eb=0), либо дискаунт не открывали/не было активности
    # Для строки D0: смотрим на D0+1 (D1) из истории
    df["d1_activity"] = df["disc_sold"].fillna(0) + df["writeoff_direct"].fillna(0)
    df["d1_zero"]     = (df["d1_activity"] == 0).astype(int)
    # Присоединяем d1_zero следующего дня к текущей строке (= D1 для текущего D0)
    _d1z = (df[["store_id","sku_id","date","d1_zero"]]
            .assign(date=lambda x: x["date"] - pd.Timedelta(days=1))
            .rename(columns={"d1_zero": "d1_zero_next"}))
    df = df.merge(_d1z, on=["store_id","sku_id","date"], how="left")
    df["d1_zero_next"] = df["d1_zero_next"].fillna(0).astype(int)
    # Считаем по DOW-группе: сколько раз из последних 3 D1 был нулевой активностью
    gdow2 = df.sort_values("date").groupby(["store_id","sku_id","dow"])
    df["d1_zero_count_3w"] = (gdow2["d1_zero_next"]
                              .transform(lambda x: x.shift(1).rolling(3, min_periods=1).sum())
                              .fillna(0).astype(int))

    # Store daily volume (yesterday)
    sv = df.groupby(["store_id","date"])["demand_qty"].sum().reset_index(name="store_vol")
    sv["store_lag1d"] = sv.groupby("store_id")["store_vol"].shift(1)
    df = df.merge(sv[["store_id","date","store_lag1d"]], on=["store_id","date"], how="left")
    df["store_lag1d"] = df["store_lag1d"].fillna(0)

    # Weather
    if not weather_df.empty:
        wcols = [c for c in ["date","temp_avg","precip","snow","temp_max","temp_min"] if c in weather_df.columns]
        df = df.merge(weather_df[wcols], on="date", how="left")
        df = df.sort_values(["store_id","sku_id","date"])
        df["temp_change"] = df.groupby(["store_id","sku_id"])["temp_avg"].diff()
        df["is_rainy"]    = (df.get("precip", pd.Series(0, index=df.index)) > 1.0).astype(int)
        df["is_snowy"]    = (df.get("snow",   pd.Series(0, index=df.index)) > 0.5).astype(int)
    else:
        for c in ["temp_avg","precip","snow","temp_change","is_rainy","is_snowy","temp_max","temp_min"]:
            df[c] = 0.0

    # Також зберігаємо writeoff_d1 — для фічей і фільтра буфера
    _wrt_d1 = (df[["store_id","sku_id","date","writeoff_direct"]].copy()
               .assign(date=lambda x: x["date"] - pd.Timedelta(days=1))
               .rename(columns={"writeoff_direct": "writeoff_d1"}))
    _wrt_mov = (df[["store_id","sku_id","date","writeoff_movement"]].copy()
                .assign(date=lambda x: x["date"] - pd.Timedelta(days=1))
                .rename(columns={"writeoff_movement": "writeoff_mov_d1"}))
    df = df.merge(_wrt_mov, on=["store_id","sku_id","date"], how="left")
    df["writeoff_mov_d1"] = df["writeoff_mov_d1"].fillna(0)
    df = df.merge(_wrt_d1, on=["store_id","sku_id","date"], how="left")
    df["writeoff_d1"] = df["writeoff_d1"].fillna(0)

    # writeoff_d1 rolling features — анти-оверсток сигнал для моделі і буфера
    gdow_wrt = df.sort_values("date").groupby(["store_id","sku_id","dow"])
    df["writeoff_d1_lag1w"] = gdow_wrt["writeoff_d1"].shift(1).fillna(0)
    df["writeoff_d1_3w"]    = (gdow_wrt["writeoff_d1"]
                               .transform(lambda x: x.shift(1).rolling(3, min_periods=1).mean())
                               .fillna(0))

    # ── Consumption lags (лаги реального споживання, не відвантаження) ────────
    # Ключова різниця vs supply_lag*: не включають writeoff → без bias вгору
    gdow_cons = df.sort_values("date").groupby(["store_id","sku_id","dow"])
    df["demand_lag1w"] = gdow_cons["demand_d0_d1"].shift(1).fillna(0)
    df["demand_lag2w"] = gdow_cons["demand_d0_d1"].shift(2).fillna(0)
    df["demand_lag3w"] = gdow_cons["demand_d0_d1"].shift(3).fillna(0)
    df["demand_trend"] = df["demand_lag1w"] / (df["demand_lag2w"] + 1)  # тренд споживання

    # Drop artificially filled rows (gaps) — they should not be in train/test
    df = df[df["_real"]].drop(columns=["_real"])

    # Отрезаем extra день (EVAL_LAST_DATE+1) — он нужен только для D1 таргета
    df = df[df["date"] <= EVAL_LAST_DATE]

    return df.fillna(0)


# ── Metrics ───────────────────────────────────────────────────────────
def wape(y_true, y_pred) -> float:
    d = np.sum(y_true)
    return float(np.sum(np.abs(y_true - y_pred)) / d) if d > 0 else 0.0

def rmse(y_true, y_pred) -> float:
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))

def mae(y_true, y_pred) -> float:
    return float(np.mean(np.abs(y_true - y_pred)))

def bias(y_true, y_pred) -> float:
    """Positive = model over-predicts (excess bread/write-offs)
       Negative = model under-predicts (OOS risk)"""
    return float(np.mean(y_pred - y_true))


# ── Main: run experiment using agent's config ─────────────────────────
def run_experiment(agent) -> dict:
    """
    agent — imported train module with .FEATURES, .PARAMS, .extra_features()
    Returns dict: {wape, wape_by_dow, n_estimators}
    Raises RuntimeError on invalid config.
    """
    df = build_base_features(load_data(), load_weather())

    # Agent extends features
    df = agent.extra_features(df)

    cat_features = ["store_id","sku_id","dow","month"]
    for c in cat_features:
        df[c] = df[c].astype("category")

    train_df = df[df["date"] <  EVAL_TEST_START].copy()
    # DQ gate: убираем строки с аномальными данными (neg_eb, fresh>supply)
    n_before = len(train_df)
    if "dq_bad" in train_df.columns:
        train_df = train_df[train_df["dq_bad"] == 0]
        print(f"  DQ gate: removed {n_before - len(train_df)} rows from train ({n_before} -> {len(train_df)})")
    # Sample weights: OOS рядки не дропаємо, але даємо їм меншу вагу
    # OOS_WEIGHT=0.3 → модель бачить суботні/хронічно-OOS приклади, але не домінують
    OOS_WEIGHT = 0.3
    train_weights = train_df["oos_signal"].map({0: 1.0, 1: OOS_WEIGHT}).fillna(1.0).values
    oos_count = (train_df["oos_signal"] == 1).sum()
    print(f"  Sample weights: {len(train_df) - oos_count} non-OOS(w=1.0) + {oos_count} OOS(w={OOS_WEIGHT})")
    # Eval A: тест тільки non-OOS рядки (узгоджено з train розподілом)
    # Eval B: тест всі рядки (показуємо для інформації)
    test_all = df[(df["date"] >= EVAL_TEST_START) & (df["date"] <= EVAL_LAST_DATE)].copy()
    test_df  = test_all[test_all["oos_signal"] == 0].copy()   # Eval A — основна метрика

    if train_df.empty or test_df.empty:
        raise RuntimeError("train or test split is empty")

    missing = [f for f in agent.FEATURES if f not in df.columns]
    if missing:
        raise RuntimeError(f"Missing columns: {missing}")

    params = {**agent.PARAMS, "random_state": 42, "verbosity": -1}
    model  = lgb.LGBMRegressor(**params)
    model.fit(
        train_df[agent.FEATURES], train_df["demand_d0_d1"],
        sample_weight=train_weights,
        categorical_feature=[c for c in cat_features if c in agent.FEATURES],
        eval_set=[(test_df[agent.FEATURES], test_df["demand_d0_d1"])],
        callbacks=[lgb.early_stopping(stopping_rounds=30, verbose=False)],
    )

    # Eval A: основна метрика — тест на non-OOS рядках (узгоджений з train)
    preds_a = np.maximum(0, model.predict(test_df[agent.FEATURES]))
    y_true_a = test_df["demand_d0_d1"].values
    total = wape(y_true_a, preds_a)
    bias_a = bias(y_true_a, preds_a)

    # Eval B: інформаційна — тест на всіх рядках (показує OOS-дрейф)
    preds_b  = np.maximum(0, model.predict(test_all[agent.FEATURES]))
    y_true_b = test_all["demand_d0_d1"].values
    wape_b   = round(wape(y_true_b, preds_b), 4)
    bias_b   = round(bias(y_true_b, preds_b), 3)

    days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
    by_dow = {}
    for d in range(7):
        mask = test_df["dow"] == d
        if mask.any():
            by_dow[days[d]] = round(wape(test_df.loc[mask,"demand_d0_d1"].values, preds_a[mask.values]), 4)

    # Feature importances (adapted from autoresearch PR #353)
    importances = dict(zip(agent.FEATURES, model.feature_importances_))
    sorted_imp   = sorted(importances.items(), key=lambda x: x[1], reverse=True)
    top5    = {k: int(v) for k, v in sorted_imp[:5]}
    bottom5 = {k: int(v) for k, v in sorted_imp[-5:]}

    return {
        "wape":            round(total, 4),       # Eval A (non-OOS test) — основна
        "wape_all":        wape_b,                # Eval B (all test) — інформаційна
        "bias_all":        bias_b,                # Eval B bias
        "preds_a":         preds_a,
        "y_true_a":        y_true_a,
        "test_df":         test_df,

        "rmse":            round(rmse(y_true_a, preds_a), 3),
        "mae":             round(mae(y_true_a, preds_a), 3),
        "wape_by_dow":     by_dow,
        "n_estimators":    model.best_iteration_ or params.get("n_estimators", 1000),
        "top_features":    top5,
        "bottom_features": bottom5,
    }


# ── Standalone run ────────────────────────────────────────────────────
if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))
    for k in list(sys.modules):
        if "train" in k: del sys.modules[k]
    import train as agent

    print(f"Baseline check with current train.py ...")
    try:
        result = run_experiment(agent)
        print(f"\nWAPE:     {result['wape']:.4f}")
        print(f"By DOW:   {result['wape_by_dow']}")
        print(f"Trees:    {result['n_estimators']}")

        # Validate on 1 arbitrary item
        test_df = result["test_df"]
        preds = result["preds_a"]
        if len(test_df) > 0:
            row = test_df.iloc[0]
            pred = preds[0]
            print(f"\nManual Verification (store={row['store_id']}, sku={row['sku_id']}, date={row['date'].date()}):")
            print(f"  fresh_sold(D0): {row['fresh_sold']:.1f}")
            print(f"  disc_sold(D1):  {row['disc_sold_d1']:.1f}")
            print(f"  TARGET (fresh+disc): {row['demand_d0_d1']:.1f}")
            print(f"  Model Predicted:     {pred:.1f}")
            print(f"  Feature lag_2d:      {row['lag_2d']:.1f}")
            print(f"  Feature trend_7d:    {row['trend_7d']:.1f}")

    except Exception:
        traceback.print_exc()
