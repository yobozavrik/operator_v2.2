"""
build_morning_feature.py
========================
Збирає morning_balance_full.csv з двох джерел:
  1. morning_balance.csv (Excel, Aug 2025 – Jan 2026)
  2. leftovers.daily_snapshots (Supabase, Feb 2026 – сьогодні)

Вихід: morning_balance_full.csv  (date, store_id, sku_id, morning_balance)
"""
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import pandas as pd
from pathlib import Path
from supabase import create_client

def _load_env():
    env_file = Path(__file__).resolve().parent.parent / ".env.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
_load_env()

CSV_PATH  = Path(__file__).parent / "morning_balance.csv"
OUT_PATH  = Path(__file__).parent / "morning_balance_full.csv"

# Правильний маппінг (верифіковано через Poster API 2026-03-22)
STORAGE_TO_STORE = {
    2: 5,  3: 8,  5: 3,  6: 18, 7: 16, 8: 23, 9: 4,
    20: 6, 21: 13, 30: 22, 33: 9, 34: 20, 36: 19,
    39: 21, 43: 15, 44: 2, 45: 1, 47: 7, 52: 12, 53: 14, 55: 17,
}
INGR_TO_SKU = {
    1859: 768, 1867: 772, 1864: 774, 1861: 776,
    1866: 778, 1888: 780, 1870: 832, 1884: 833,
    1869: 837, 1862: 839, 1865: 843, 1898: 849,
    1955: 880, 2285: 1147,
}

def load_excel(cutoff_date: str) -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH, parse_dates=["date"])
    df["date"] = df["date"].dt.date.astype(str)
    df = df[df["date"] < cutoff_date]
    df = df.rename(columns={"morning_balance": "morning_balance"})
    return df[["date", "store_id", "sku_id", "morning_balance"]]

def load_supabase(from_date: str) -> pd.DataFrame:
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sb  = create_client(url, key)

    storage_ids    = list(STORAGE_TO_STORE.keys())
    ingredient_ids = list(INGR_TO_SKU.keys())

    # Визначаємо потрібні місяці
    start = pd.Timestamp(from_date)
    end   = pd.Timestamp.today()
    months = []
    cur = start.replace(day=1)
    while cur <= end:
        months.append(f"daily_snapshots_{cur.year}_{cur.month:02d}")
        cur = (cur + pd.offsets.MonthEnd(0)) + pd.Timedelta(days=1)

    all_rows = []
    for tbl in months:
        try:
            res = (sb.schema("leftovers").table(tbl)
                   .select("snapshot_date,storage_id,ingredient_id,storage_ingredient_left")
                   .in_("storage_id", storage_ids)
                   .in_("ingredient_id", ingredient_ids)
                   .gte("snapshot_date", from_date)
                   .execute())
            all_rows.extend(res.data or [])
            print(f"  {tbl}: {len(res.data or [])} рядків")
        except Exception as e:
            print(f"  {tbl}: помилка — {e}")

    if not all_rows:
        return pd.DataFrame(columns=["date","store_id","sku_id","morning_balance"])

    df = pd.DataFrame(all_rows)
    df["date"]     = df["snapshot_date"].astype(str)
    df["store_id"] = df["storage_id"].map(STORAGE_TO_STORE)
    df["sku_id"]   = df["ingredient_id"].map(INGR_TO_SKU)
    df["morning_balance"] = df["storage_ingredient_left"].astype(float)
    df = df.dropna(subset=["store_id","sku_id"])
    df["store_id"] = df["store_id"].astype(int)
    df["sku_id"]   = df["sku_id"].astype(int)
    df = df.drop_duplicates(["date","store_id","sku_id"])
    return df[["date","store_id","sku_id","morning_balance"]]

def main():
    # Excel покриває до 2026-02-08 (останній день = 2026-02-07)
    CUTOFF = "2026-02-08"

    print("Завантажую Excel (до 2026-02-07)...")
    xl = load_excel(CUTOFF)
    print(f"  Excel: {len(xl)} рядків  ({xl['date'].min()} → {xl['date'].max()})")

    print(f"\nЗавантажую Supabase leftovers (від {CUTOFF})...")
    sb = load_supabase(CUTOFF)
    if not sb.empty:
        print(f"  Supabase: {len(sb)} рядків  ({sb['date'].min()} → {sb['date'].max()})")

    # Об'єднуємо
    combined = pd.concat([xl, sb], ignore_index=True)
    combined = combined.drop_duplicates(["date","store_id","sku_id"])
    combined = combined.sort_values(["date","store_id","sku_id"]).reset_index(drop=True)

    combined.to_csv(OUT_PATH, index=False, encoding="utf-8-sig")

    print(f"\n── Підсумок morning_balance_full.csv ──")
    print(f"  Рядків:    {len(combined)}")
    print(f"  Дати:      {combined['date'].min()} → {combined['date'].max()}")
    print(f"  Магазини:  {sorted(combined['store_id'].unique())}")
    print(f"  SKU:       {sorted(combined['sku_id'].unique())}")
    neg = (combined['morning_balance'] < 0).sum()
    zer = (combined['morning_balance'] == 0).sum()
    pos = (combined['morning_balance'] > 0).sum()
    print(f"  Від'ємні (OOS): {neg} ({neg/len(combined)*100:.1f}%)")
    print(f"  Нульові:        {zer} ({zer/len(combined)*100:.1f}%)")
    print(f"  Додатні:        {pos} ({pos/len(combined)*100:.1f}%)")
    print(f"\nЗбережено: {OUT_PATH}")

if __name__ == "__main__":
    main()
