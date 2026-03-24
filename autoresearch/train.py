"""
Exploring the 'store_dow_rel_strength' hypothesis. By calculating the ratio of a store's average 2-day demand on a specific day of the week to its overall average 2-day demand, 
we help the model distinguish between different store profiles (e.g., residential stores with weekend spikes vs. office-area stores that are quiet on weekends). 
This is intended to address the high WAPE on Saturdays.
"""

import pandas as pd

FEATURES = [
    # IDs / calendar
    "store_id", "sku_id", "day", "is_weekend",
    # 2D Consumption lags / Trend
    "lag_2d", "lag_diff", "trend_7d",
    # Hybrid Safe Features
    "demand_d0_d1_lag1w_clipped",
    # OOS / Recent trend
    "oos_rate_4w", "dow_oos_rate", "demand_recent_bias", "sku_recent_performance",
    # Store / supply context
    "store_lag1d", "supply_2d_lag1w", "store_sku_dow_avg", "store_sku_dow_std", 
    "global_sku_dow_avg_2d", "store_total_lag1w", "store_growth_ratio", "store_dow_rel_strength",
    # Weather
    "temp_avg", "temp_change", "precip", "temp_anomaly"
]

PARAMS = {
    "n_estimators": 1000,
    "learning_rate": 0.02,
    "num_leaves": 35,
    "max_depth": 7,
    "min_child_samples": 40,
    "colsample_bytree": 0.8,
    "subsample": 0.8,
    "reg_alpha": 0.1,
    "reg_lambda": 0.1,
}

def extra_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values("date").copy()

    # Weather anomaly: deviation of today's temp from historical average for this DOW
    df["temp_hist_avg"] = df.groupby("dow")["temp_avg"].transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean()
    ).fillna(df["temp_avg"])
    df["temp_anomaly"] = df["temp_avg"] - df["temp_hist_avg"]

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

    # Weekly trend direction (momentum)
    df["lag_diff"] = df["lag_2d"] - df["lag_14d_2d"]

    # Bias of last week vs the historical DOW mean
    df["demand_recent_bias"] = df["lag_2d"] - df["store_sku_dow_avg"]
    
    # Recent trend ratio vs historical DOW baseline
    df["sku_recent_performance"] = (df["trend_7d"] + 1.0) / (df["store_sku_dow_avg"] + 1.0)

    # Store-level total volume (DOW-aligned, expanding)
    g_store = df.groupby(["store_id", "dow"])
    df["store_total_lag1w"] = g_store["lag_2d"].transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean()
    )
    store_total_lag2w = g_store["lag_14d_2d"].transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean()
    )
    df["store_growth_ratio"] = df["store_total_lag1w"] / (store_total_lag2w + 1.0)

    # Store DOW Profile: How much stronger/weaker is this store on this specific DOW compared to its average day?
    store_overall_avg = df.groupby("store_id")["lag_2d"].transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean()
    )
    df["store_dow_rel_strength"] = df["store_total_lag1w"] / (store_overall_avg + 1.0)

    return df

# NEXT_HYPOTHESIS: Try adding 'sku_dow_rel_importance' (store_sku_dow_avg / global_sku_dow_avg_2d) to capture how much a specific SKU over/under-performs at a store compared to the chain average on that day.