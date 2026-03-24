"""
verify_balance_sources.py
=========================
Звіряє дані Excel (morning_balance.csv) з Supabase (bakery1.balance_snapshots)
за період де є обидва джерела (2026-01-19+).
"""
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import pandas as pd
import numpy as np
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

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
CSV_PATH     = Path("D:/operator-main/autoresearch/morning_balance.csv")

OVERLAP_START = "2026-01-19"
OVERLAP_END   = "2026-02-07"  # останній день в Excel

def load_excel(start, end):
    df = pd.read_csv(CSV_PATH, parse_dates=["date"])
    df["date"] = df["date"].dt.date.astype(str)
    df = df[(df["date"] >= start) & (df["date"] <= end)]
    df = df.rename(columns={"store_id": "spot_id", "sku_id": "product_id", "morning_balance": "bal_excel"})
    df["bal_excel"] = df["bal_excel"].clip(lower=0)  # клямуємо як у Supabase
    return df[["date", "spot_id", "product_id", "bal_excel"]]

def load_supabase(start, end):
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    # Беремо тільки morning знімки
    res = (sb.schema("bakery1")
             .table("balance_snapshots")
             .select("snapshot_time,spot_id,product_id,balance_qty,snapshot_type")
             .gte("snapshot_time", f"{start}T00:00:00")
             .lte("snapshot_time", f"{end}T23:59:59")
             .eq("snapshot_type", "morning")
             .execute())
    if not res.data:
        print("  WARN: немає morning-знімків у Supabase за цей період")
        # Пробуємо всі типи
        res = (sb.schema("bakery1")
                 .table("balance_snapshots")
                 .select("snapshot_time,spot_id,product_id,balance_qty,snapshot_type")
                 .gte("snapshot_time", f"{start}T00:00:00")
                 .lte("snapshot_time", f"{end}T23:59:59")
                 .execute())
    df = pd.DataFrame(res.data or [])
    if df.empty:
        return pd.DataFrame(columns=["date","spot_id","product_id","bal_sb"])
    df["date"] = df["snapshot_time"].str[:10]
    df = df.rename(columns={"balance_qty": "bal_sb"})
    df["bal_sb"] = df["bal_sb"].astype(float)
    # Якщо є дублікати (кілька знімків на день) — беремо перший
    df = df.sort_values("snapshot_time").drop_duplicates(["date","spot_id","product_id"], keep="first")
    return df[["date", "spot_id", "product_id", "bal_sb"]]

def compare(excel_df, sb_df):
    merged = excel_df.merge(sb_df, on=["date","spot_id","product_id"], how="outer", indicator=True)

    only_excel = merged[merged["_merge"] == "left_only"]
    only_sb    = merged[merged["_merge"] == "right_only"]
    both       = merged[merged["_merge"] == "both"].copy()

    print(f"\n── Покриття ──")
    print(f"  Рядків в Excel (overlap): {len(excel_df)}")
    print(f"  Рядків в Supabase:        {len(sb_df)}")
    print(f"  Спільних рядків:          {len(both)}")
    print(f"  Тільки в Excel:           {len(only_excel)}")
    print(f"  Тільки в Supabase:        {len(only_sb)}")

    if both.empty:
        print("\nНемає спільних рядків — неможливо порівняти!")
        return

    both["diff"] = both["bal_excel"] - both["bal_sb"]
    both["match"] = both["diff"].abs() < 0.01

    n_match = both["match"].sum()
    n_total = len(both)
    pct     = n_match / n_total * 100

    print(f"\n── Точні збіги (±0.01) ──")
    print(f"  {n_match} / {n_total} = {pct:.1f}%")

    print(f"\n── Розподіл розбіжностей ──")
    diff_stats = both["diff"].describe()
    print(diff_stats.to_string())

    mismatches = both[~both["match"]].sort_values("diff", key=abs, ascending=False)
    if not mismatches.empty:
        print(f"\n── Топ-20 найбільших розбіжностей ──")
        print(mismatches[["date","spot_id","product_id","bal_excel","bal_sb","diff"]].head(20).to_string(index=False))

    # По магазинах
    print(f"\n── Точність по магазинах ──")
    store_acc = both.groupby("spot_id")["match"].agg(["sum","count"])
    store_acc["pct"] = store_acc["sum"] / store_acc["count"] * 100
    store_acc = store_acc.rename(columns={"sum":"matches","count":"total"})
    print(store_acc.sort_values("pct").to_string())

    # По SKU
    print(f"\n── Точність по SKU ──")
    sku_acc = both.groupby("product_id")["match"].agg(["sum","count"])
    sku_acc["pct"] = sku_acc["sum"] / sku_acc["count"] * 100
    sku_acc = sku_acc.rename(columns={"sum":"matches","count":"total"})
    print(sku_acc.sort_values("pct").to_string())

    # По датах
    print(f"\n── Точність по датах ──")
    date_acc = both.groupby("date")["match"].agg(["sum","count"])
    date_acc["pct"] = date_acc["sum"] / date_acc["count"] * 100
    bad_dates = date_acc[date_acc["pct"] < 80]
    if not bad_dates.empty:
        print(f"  Дати з < 80% збігів:")
        print(bad_dates.to_string())
    else:
        print(f"  Всі дати: {date_acc['pct'].min():.0f}%–{date_acc['pct'].max():.0f}%  (середнє {date_acc['pct'].mean():.1f}%)")

if __name__ == "__main__":
    print(f"Завантажую Excel ({OVERLAP_START} → {OVERLAP_END})...")
    excel_df = load_excel(OVERLAP_START, OVERLAP_END)
    print(f"  {len(excel_df)} рядків")

    print(f"\nЗавантажую Supabase ({OVERLAP_START} → {OVERLAP_END})...")
    sb_df = load_supabase(OVERLAP_START, OVERLAP_END)
    print(f"  {len(sb_df)} рядків  |  типи: {sb_df.get('snapshot_type', pd.Series()).unique() if not sb_df.empty else '—'}")

    compare(excel_df, sb_df)
