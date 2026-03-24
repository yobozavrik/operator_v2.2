"""
find_storage_mapping.py
=======================
Знаходить маппінг storage_id (Supabase) → store_id (ML model)
через кореляцію значень балансів за грудень 2025.

Логіка:
  Для кожного (date, ingredient_id) порівнюємо:
    - storage_ingredient_left з Supabase (по storage_id)
    - morning_balance з Excel CSV (по store_id)
  Рахуємо кількість точних збігів → максимум = правильний маппінг
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import os
import pandas as pd
import numpy as np
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

CSV_PATH = "D:/operator-main/autoresearch/morning_balance.csv"

# Маппінг ingredient_id → sku_id
INGR_TO_SKU = {
    1859: 768, 1867: 772, 1864: 774, 1861: 776,
    1866: 778, 1888: 780, 1870: 832, 1884: 833,
    1869: 837, 1862: 839, 1865: 843, 1898: 849,
    1955: 880, 2285: 1147,
}

BREAD_INGREDIENT_IDS = list(INGR_TO_SKU.keys())

# Магазини яких ще не знаємо
KNOWN_STORE_MAP = {
    2: 2, 3: 3, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
    13: 13, 15: 15, 20: 20, 21: 21, 22: 22,
}
MISSING_STORE_IDS = [1, 4, 12, 14, 16, 17, 18, 19, 23]

def fetch_supabase_dec():
    """Завантажує дані з Supabase за грудень 2025"""
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    rows = (sb.schema("leftovers")
              .table("daily_snapshots_2025_12")
              .select("snapshot_date,storage_id,ingredient_id,storage_ingredient_left")
              .in_("ingredient_id", BREAD_INGREDIENT_IDS)
              .execute())
    df = pd.DataFrame(rows.data)
    if df.empty:
        print("WARN: Supabase грудень порожній!")
        return pd.DataFrame()
    df["snapshot_date"] = pd.to_datetime(df["snapshot_date"])
    df["sku_id"] = df["ingredient_id"].map(INGR_TO_SKU)
    return df

def load_csv_dec():
    """Завантажує Excel дані за грудень 2025"""
    df = pd.read_csv(CSV_PATH, parse_dates=["date"])
    df = df[(df["date"] >= "2025-12-01") & (df["date"] <= "2025-12-31")]
    return df

def find_mapping(sb_df, csv_df):
    """Кореляція storage_id → store_id"""
    # Всі унікальні storage_ids
    all_storage_ids = sorted(sb_df["storage_id"].unique())

    print(f"\nUnique storage_ids в Supabase грудень: {all_storage_ids}")
    print(f"Вже відомі: {list(KNOWN_STORE_MAP.keys())}")
    unknown = [s for s in all_storage_ids if s not in KNOWN_STORE_MAP]
    print(f"Невідомі: {unknown}")

    # Для невідомих storage_ids — знайти найкращий match серед MISSING_STORE_IDS
    results = {}

    for storage_id in unknown:
        sb_sub = sb_df[sb_df["storage_id"] == storage_id][["snapshot_date", "sku_id", "storage_ingredient_left"]]
        sb_sub = sb_sub.rename(columns={"snapshot_date": "date", "storage_ingredient_left": "bal_sb"})
        sb_sub = sb_sub.drop_duplicates(["date", "sku_id"])

        best_store = None
        best_matches = -1
        best_corr = -999

        for store_id in MISSING_STORE_IDS + list(KNOWN_STORE_MAP.values()):
            csv_sub = csv_df[csv_df["store_id"] == store_id][["date", "sku_id", "morning_balance"]]
            csv_sub = csv_sub.rename(columns={"morning_balance": "bal_csv"})

            merged = sb_sub.merge(csv_sub, on=["date", "sku_id"], how="inner")
            if len(merged) < 3:
                continue

            # Рахуємо точні збіги і кореляцію
            exact = (merged["bal_sb"] == merged["bal_csv"]).sum()
            corr  = merged["bal_sb"].corr(merged["bal_csv"]) if len(merged) >= 3 else 0

            if exact > best_matches or (exact == best_matches and corr > best_corr):
                best_matches = exact
                best_corr    = corr if not np.isnan(corr) else 0
                best_store   = store_id

        results[storage_id] = (best_store, best_matches, best_corr)
        print(f"  storage_id={storage_id} → store_id={best_store}  "
              f"(exact_matches={best_matches}, corr={best_corr:.3f})")

    return results

def build_full_map(results):
    full_map = dict(KNOWN_STORE_MAP)
    for storage_id, (store_id, matches, corr) in results.items():
        if store_id is not None and matches >= 3:
            full_map[storage_id] = store_id
    print(f"\n── ПОВНИЙ МАППІНГ storage_id → store_id ──")
    for k, v in sorted(full_map.items()):
        print(f"  {k} → {v}")
    return full_map

if __name__ == "__main__":
    print("Завантажую Supabase (груд 2025)...")
    sb_df = fetch_supabase_dec()
    print(f"  Записів: {len(sb_df)}")

    print("Завантажую Excel CSV (груд 2025)...")
    csv_df = load_csv_dec()
    print(f"  Записів: {len(csv_df)}")

    if sb_df.empty or csv_df.empty:
        print("Недостатньо даних для кореляції!")
    else:
        results = find_mapping(sb_df, csv_df)
        full_map = build_full_map(results)
