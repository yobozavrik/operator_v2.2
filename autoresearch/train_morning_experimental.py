"""
Stable train.py for demand_d0_d1 target.
Focus: Applying P0/P1 patches + morning_balance integration.
"""

import pandas as pd
from pathlib import Path

FEATURES = [
    # IDs / calendar
    "store_id", "sku_id", "day",
    # 2D Consumption lags matches target demand_d0_d1
    "lag_2d", "lag_14d_2d", "trend_7d",
    # OOS / Recent trend / Overstock
    "oos_rate_4w", "dow_oos_rate", "oos_pattern_3w", "d1_zero_count_3w", "writeoff_d1_3w", "demand_recent_bias",
    # Morning balance
    "morning_balance_lag1w", "morning_balance_ma3w", "morning_oos_rate_4w",
    # Store / supply context
    "store_lag1d", "supply_2d_lag1w", "store_sku_dow_avg", "store_sku_dow_std", 
    "global_sku_dow_avg_2d", "store_total_lag1w", "store_growth_ratio",
    # Weather
    "temp_avg", "temp_change", "precip",
    # Derived
    "sku_store_share"
]

PARAMS = {
    "n_estimators": 1000,
    "learning_rate": 0.02,
    "num_leaves": 48,
    "max_depth": 8,
    "min_child_samples": 25,
    "colsample_bytree": 0.8,
    "subsample": 0.8,
    "reg_alpha": 0.1,
    "reg_lambda": 0.1,
}

def extra_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values("date").copy()

    # Historical averages: expanding window (anti-leak: only past information)
    g = df.groupby(["store_id", "sku_id", "dow"])["lag_2d"]
    df["store_sku_dow_avg"] = g.transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean()
    ).fillna(0)
    df["store_sku_dow_std"] = g.transform(
        lambda x: x.shift(1).expanding(min_periods=1).std()
    ).fillna(0)
    df["global_sku_dow_avg_2d"] = (
        df.groupby(["sku_id", "dow"])["lag_2d"]
        .transform(lambda x: x.shift(1).expanding(min_periods=1).mean())
        .fillna(0)
    )

    # Bias of last week vs the historical mean
    df["demand_recent_bias"] = df["lag_2d"] - df["store_sku_dow_avg"]

    # Store-level total volume (DOW-aligned, expanding) - using 2D lags
    g_store = df.groupby(["store_id", "dow"])
    df["store_total_lag1w"] = g_store["lag_2d"].transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean()
    )
    store_total_lag2w = g_store["lag_14d_2d"].transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean()
    )
    df["store_growth_ratio"] = df["store_total_lag1w"] / (store_total_lag2w + 1.0)

    # SKU importance within its specific store context
    df["sku_store_share"] = df["store_sku_dow_avg"] / (df["store_total_lag1w"] + 1.0)

    # ───────────────────────────────────────────────────────────────────
    # Morning Balance Integration
    # ───────────────────────────────────────────────────────────────────
    mb_path = Path("autoresearch/morning_balance_full.csv")
    if mb_path.exists():
        mb = pd.read_csv(mb_path)
        mb["date"] = pd.to_datetime(mb["date"])
        if "morning_balance" not in mb.columns:
            df["morning_balance"] = 0
        else:
            mb = mb.drop_duplicates(subset=["date", "store_id", "sku_id"])
            df = df.merge(mb[["date", "store_id", "sku_id", "morning_balance"]], 
                          on=["date", "store_id", "sku_id"], how="left")
            df["morning_balance"] = df["morning_balance"].fillna(0)
    else:
        df["morning_balance"] = 0

    g_mb = df.groupby(["store_id", "sku_id", "dow"])["morning_balance"]
    
    # Lag 1w
    df["morning_balance_lag1w"] = g_mb.shift(1).fillna(0)
    
    # MA 3w
    df["morning_balance_ma3w"] = g_mb.transform(
        lambda x: x.shift(1).rolling(3, min_periods=1).mean()
    ).fillna(0)
    
    # OOS rate 4w
    df["_morning_oos"] = (df["morning_balance"] <= 0).astype(int)
    g_moos = df.groupby(["store_id", "sku_id", "dow"])["_morning_oos"]
    df["morning_oos_rate_4w"] = g_moos.transform(
        lambda x: x.shift(1).rolling(4, min_periods=1).mean()
    ).fillna(0)

    df.drop(columns=["_morning_oos", "morning_balance"], inplace=True, errors="ignore")

    return df
