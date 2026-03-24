#!/usr/bin/env python3
"""
Clean forecasting pipeline for bakery demand planning.

Stages:
1) Demand forecast per (store_id, sku_id) for target date.
2) Production order per SKU with batch rounding.
3) Distribution of produced quantity back to stores by demand share.

Input JSON schema (list of rows):
  date, store_id, sku_id, product_name, qty
Optional columns:
  demand_qty, supply_qty, oos_signal
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

try:
    from sklearn.ensemble import RandomForestRegressor  # type: ignore
except Exception:  # pragma: no cover
    RandomForestRegressor = None


@dataclass
class ModelBundle:
    model: object | None
    feature_columns: list[str]
    fallback_by_dow: pd.DataFrame


def load_data(path: Path) -> pd.DataFrame:
    with path.open("r", encoding="utf-8") as f:
        raw = json.load(f)
    df = pd.DataFrame(raw)
    required = {"date", "store_id", "sku_id", "qty"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date", "store_id", "sku_id", "qty"]).copy()

    df["store_id"] = pd.to_numeric(df["store_id"], errors="coerce").astype("Int64")
    df["sku_id"] = pd.to_numeric(df["sku_id"], errors="coerce").astype("Int64")
    df["qty"] = pd.to_numeric(df["qty"], errors="coerce").fillna(0.0)
    df["demand_target"] = pd.to_numeric(df.get("demand_qty", df["qty"]), errors="coerce").fillna(df["qty"])
    df["product_name"] = df.get("product_name", "").fillna("").astype(str)

    # Protect from accidental duplicates.
    df = df.drop_duplicates(subset=["date", "store_id", "sku_id"], keep="last")
    return df


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.sort_values(["store_id", "sku_id", "date"]).copy()
    out["dow"] = out["date"].dt.dayofweek
    out["month"] = out["date"].dt.month
    out["day"] = out["date"].dt.day
    out["is_weekend"] = out["dow"].isin([5, 6]).astype(int)
    out["is_payday"] = out["day"].isin([1, 2, 15, 16, 30, 31]).astype(int)

    grp = out.groupby(["store_id", "sku_id"], group_keys=False)["demand_target"]
    out["lag_1"] = grp.shift(1)
    out["lag_7"] = grp.shift(7)
    out["lag_14"] = grp.shift(14)
    out["ma_7"] = grp.shift(1).rolling(window=7, min_periods=1).mean()
    out["trend_14"] = grp.shift(1).rolling(window=14, min_periods=3).mean()

    # Global sku profile for this day-of-week.
    out["global_sku_dow_mean"] = (
        out.groupby(["sku_id", "dow"], group_keys=False)["demand_target"]
        .transform(lambda s: s.shift(1).rolling(window=6, min_periods=1).mean())
        .fillna(0.0)
    )
    return out


def train_bundle(df_train: pd.DataFrame) -> ModelBundle:
    feature_columns = [
        "store_id",
        "sku_id",
        "dow",
        "month",
        "day",
        "is_weekend",
        "is_payday",
        "lag_1",
        "lag_7",
        "lag_14",
        "ma_7",
        "trend_14",
        "global_sku_dow_mean",
    ]

    fit = df_train.dropna(subset=["demand_target"]).copy()
    X = fit[feature_columns].fillna(0.0)
    y = fit["demand_target"].clip(lower=0.0)

    fallback_by_dow = (
        fit.groupby(["store_id", "sku_id", "dow"], as_index=False)["demand_target"].mean()
        .rename(columns={"demand_target": "fallback_demand"})
    )

    if RandomForestRegressor is None or len(X) < 200:
        return ModelBundle(model=None, feature_columns=feature_columns, fallback_by_dow=fallback_by_dow)

    model = RandomForestRegressor(
        n_estimators=300,
        max_depth=14,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X, y)
    return ModelBundle(model=model, feature_columns=feature_columns, fallback_by_dow=fallback_by_dow)


def build_predict_frame(df: pd.DataFrame, target_date: pd.Timestamp) -> pd.DataFrame:
    pairs = (
        df.groupby(["store_id", "sku_id"], as_index=False)
        .agg(product_name=("product_name", "last"), last_seen=("date", "max"))
    )
    pairs = pairs[pairs["last_seen"] >= target_date - pd.Timedelta(days=21)].copy()
    pairs["date"] = target_date

    base = pairs[["date", "store_id", "sku_id", "product_name"]].copy()
    merged = pd.concat([df[["date", "store_id", "sku_id", "product_name", "demand_target"]], base], ignore_index=True)
    merged = add_features(merged)

    # Keep only synthetic rows for target date.
    pred = merged[merged["date"] == target_date].copy()
    return pred


def predict_demand(bundle: ModelBundle, pred_df: pd.DataFrame, target_date: pd.Timestamp) -> pd.DataFrame:
    x_pred = pred_df[bundle.feature_columns].fillna(0.0)

    if bundle.model is not None:
        pred_df["predicted_qty"] = np.maximum(0.0, bundle.model.predict(x_pred))
    else:
        # Fallback: mean demand by (store, sku, dow).
        fallback = bundle.fallback_by_dow.copy()
        fallback["dow"] = int(target_date.dayofweek)
        pred_df = pred_df.merge(
            fallback[["store_id", "sku_id", "dow", "fallback_demand"]],
            on=["store_id", "sku_id", "dow"],
            how="left",
        )
        pred_df["predicted_qty"] = pred_df["fallback_demand"].fillna(pred_df["ma_7"]).fillna(0.0).clip(lower=0.0)

    return pred_df[["store_id", "sku_id", "product_name", "predicted_qty"]].copy()


def build_production_order(predictions: pd.DataFrame, batch_size: int) -> pd.DataFrame:
    order = (
        predictions.groupby(["sku_id", "product_name"], as_index=False)["predicted_qty"].sum()
        .rename(columns={"predicted_qty": "forecast_total_qty"})
    )
    order["production_qty"] = (np.round(order["forecast_total_qty"] / batch_size) * batch_size).astype(int)
    order["production_qty"] = order["production_qty"].clip(lower=0)
    return order.sort_values("production_qty", ascending=False)


def build_distribution(predictions: pd.DataFrame, production_order: pd.DataFrame) -> pd.DataFrame:
    merged = predictions.merge(
        production_order[["sku_id", "production_qty"]],
        on="sku_id",
        how="left",
    )
    merged["production_qty"] = merged["production_qty"].fillna(0).astype(int)

    def allocate(group: pd.DataFrame) -> pd.DataFrame:
        total_forecast = float(group["predicted_qty"].sum())
        total_prod = int(group["production_qty"].iloc[0])
        if total_prod <= 0 or total_forecast <= 0:
            group["allocated_qty"] = 0
            return group

        shares = group["predicted_qty"] / total_forecast
        group["allocated_qty"] = np.floor(shares * total_prod).astype(int)
        residue = total_prod - int(group["allocated_qty"].sum())
        if residue > 0:
            top_idx = group["predicted_qty"].sort_values(ascending=False).index[:residue]
            group.loc[top_idx, "allocated_qty"] += 1
        return group

    # Avoid groupby.apply deprecation behavior changes and keep sku_id as a regular column.
    allocated_groups: list[pd.DataFrame] = []
    for _, group in merged.groupby("sku_id", sort=False):
        allocated_groups.append(allocate(group.copy()))

    dist = pd.concat(allocated_groups, ignore_index=True) if allocated_groups else merged.assign(allocated_qty=0)
    return dist[["store_id", "sku_id", "product_name", "predicted_qty", "allocated_qty"]].sort_values(
        ["store_id", "allocated_qty"], ascending=[True, False]
    )


def save_csv(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, encoding="utf-8")


def calculate_wape(actual: pd.Series, predicted: pd.Series) -> float:
    denom = float(actual.abs().sum())
    if denom <= 0:
        return float("nan")
    return float((actual - predicted).abs().sum() / denom)


def run_backtest(df_with_features: pd.DataFrame, end_date: pd.Timestamp, backtest_days: int) -> tuple[float, pd.DataFrame]:
    all_dates = sorted(df_with_features["date"].dropna().unique())
    eval_dates = [d for d in all_dates if d < end_date][-backtest_days:]
    rows: list[dict[str, float | str | int]] = []

    for eval_date in eval_dates:
        train_df = df_with_features[df_with_features["date"] < eval_date].copy()
        if train_df.empty:
            continue

        bundle = train_bundle(train_df)
        pred_frame = build_predict_frame(train_df, pd.Timestamp(eval_date))
        pred = predict_demand(bundle, pred_frame, pd.Timestamp(eval_date))

        actual = (
            df_with_features[df_with_features["date"] == eval_date][["store_id", "sku_id", "demand_target"]]
            .rename(columns={"demand_target": "actual_qty"})
            .copy()
        )
        compare = actual.merge(
            pred[["store_id", "sku_id", "predicted_qty"]],
            on=["store_id", "sku_id"],
            how="left",
        )
        compare["predicted_qty"] = compare["predicted_qty"].fillna(0.0)

        day_wape = calculate_wape(compare["actual_qty"], compare["predicted_qty"])
        rows.append(
            {
                "date": pd.Timestamp(eval_date).strftime("%Y-%m-%d"),
                "rows": int(len(compare)),
                "wape": day_wape,
            }
        )

    details = pd.DataFrame(rows)
    if details.empty:
        return float("nan"), details

    # Micro-average WAPE over all backtest rows.
    merged_parts = []
    for eval_date in details["date"].tolist():
        d = pd.to_datetime(eval_date)
        train_df = df_with_features[df_with_features["date"] < d].copy()
        bundle = train_bundle(train_df)
        pred_frame = build_predict_frame(train_df, d)
        pred = predict_demand(bundle, pred_frame, d)
        actual = (
            df_with_features[df_with_features["date"] == d][["store_id", "sku_id", "demand_target"]]
            .rename(columns={"demand_target": "actual_qty"})
            .copy()
        )
        compare = actual.merge(
            pred[["store_id", "sku_id", "predicted_qty"]],
            on=["store_id", "sku_id"],
            how="left",
        )
        compare["predicted_qty"] = compare["predicted_qty"].fillna(0.0)
        merged_parts.append(compare)

    joined = pd.concat(merged_parts, ignore_index=True) if merged_parts else pd.DataFrame()
    wape = calculate_wape(joined["actual_qty"], joined["predicted_qty"]) if not joined.empty else float("nan")
    return wape, details


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bakery forecasting clean pipeline")
    parser.add_argument("--input", default="research_data_enriched.json", help="Input json path")
    parser.add_argument("--date", required=True, help="Target date YYYY-MM-DD")
    parser.add_argument("--batch-size", type=int, default=10, help="Production rounding batch")
    parser.add_argument("--out-dir", default="artifacts/forecasting", help="Output directory")
    parser.add_argument("--backtest-days", type=int, default=0, help="If > 0, compute WAPE on last N days before --date")
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    target_date = pd.to_datetime(args.date, errors="coerce")
    if pd.isna(target_date):
        raise ValueError("--date must be valid YYYY-MM-DD")

    df = load_data(Path(args.input))
    df = add_features(df)
    df_train = df[df["date"] < target_date].copy()
    if df_train.empty:
        raise ValueError("No training data before target date")

    bundle = train_bundle(df_train)
    pred_df = build_predict_frame(df_train, target_date)
    predictions = predict_demand(bundle, pred_df, target_date)
    production_order = build_production_order(predictions, args.batch_size)
    distribution = build_distribution(predictions, production_order)

    out_dir = Path(args.out_dir)
    save_csv(predictions, out_dir / f"predictions_{args.date}.csv")
    save_csv(production_order, out_dir / f"production_order_{args.date}.csv")
    save_csv(distribution, out_dir / f"distribution_{args.date}.csv")

    if args.backtest_days > 0:
        backtest_wape, backtest_details = run_backtest(df, target_date, args.backtest_days)
        save_csv(backtest_details, out_dir / f"backtest_wape_daily_{args.date}.csv")
        if np.isnan(backtest_wape):
            print(f"Backtest WAPE ({args.backtest_days}d): n/a")
        else:
            print(f"Backtest WAPE ({args.backtest_days}d): {backtest_wape:.4f} ({backtest_wape * 100:.2f}%)")

    print(f"Predictions rows: {len(predictions)}")
    print(f"Production rows: {len(production_order)}")
    print(f"Distribution rows: {len(distribution)}")
    print(f"Output dir: {out_dir.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
