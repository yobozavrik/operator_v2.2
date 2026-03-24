"""
Experimental train.py.
Focus: Hypotheses targeting specific DOW/Shocks: is_saturday, lag_shock, store_pressure.
Results: WAPE 0.3405, Sat drops to 0.4778, other days slightly degrade.
"""

import pandas as pd

FEATURES = [
    # IDs / calendar
    "store_id", "sku_id", "day",
    # 2D Consumption lags matches target demand_d0_d1
    "lag_2d", "lag_14d_2d", "trend_7d",
    # OOS / Recent trend / Overstock
    "oos_rate_4w", "dow_oos_rate", "oos_pattern_3w", "d1_zero_count_3w", "writeoff_d1_3w", "demand_recent_bias",
    # Store / supply context
    "store_lag1d", "supply_2d_lag1w", "store_sku_dow_avg", "store_sku_dow_std", 
    "global_sku_dow_avg_2d", "store_total_lag1w", "store_growth_ratio",
    # Hypotheses 1-3
    "is_saturday", "sat_oos", "lag_shock", "abs_lag_shock", "store_pressure",
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

    # Hypothesis 1: Saturday + OOS interplay
    df["is_saturday"] = (df["dow"] == 5).astype(int)
    df["sat_oos"]     = df["is_saturday"] * df["oos_rate_4w"].fillna(0)

    # Hypothesis 2: Temporal 2D demand shock
    df["lag_shock"]     = df["lag_2d"] - df["lag_14d_2d"]
    df["abs_lag_shock"] = df["lag_shock"].abs()

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

    # Hypothesis 3: Store pressure (activity yesterday vs normal weekly volume)
    df["store_pressure"] = df["store_lag1d"] / (df["store_total_lag1w"] + 1.0)

    # SKU importance within its specific store context
    df["sku_store_share"] = df["store_sku_dow_avg"] / (df["store_total_lag1w"] + 1.0)

    return df
