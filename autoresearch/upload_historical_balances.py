"""
upload_historical_balances.py
==============================
Завантажує Excel-дані балансів (morning_balance.csv)
у bakery1.balance_snapshots за відсутній період (до 2026-01-19).

Запуск:
    python upload_historical_balances.py [--dry-run]
"""
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import pandas as pd
from pathlib import Path
from datetime import timezone
from supabase import create_client

# ── .env.local ────────────────────────────────────────────────────
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

CSV_PATH = Path("D:/operator-main/autoresearch/morning_balance.csv")

# spot_id → storage_id (з poster_balance_snapshot.py)
SPOT_TO_STORAGE = {
    1: 3,  2: 8,  3: 9,  4: 7,  5: 2,
    6: 6,  7: 21, 8: 5,  9: 20, 12: 30,
    13: 33, 14: 36, 15: 34, 16: 39, 17: 53,
    18: 52, 19: 43, 20: 44, 21: 45, 22: 47, 23: 55,
}

# sku_id (product_id) → (ingredient_id, product_name)
PRODUCT_MAP = {
    768:  (1859, 'Хліб "Француз"'),
    849:  (1898, 'Хліб "Француз з цибулею"'),
    839:  (1862, 'Хліб "Житньо-Пшеничний"'),
    843:  (1865, 'Хліб "Тартін"'),
    778:  (1866, 'Хліб "Гречаний"'),
    772:  (1867, 'Хліб "Солодовий з журавлиною"'),
    774:  (1864, 'Хліб "Злаковий"'),
    780:  (1888, 'Хліб "Висівковий"'),
    776:  (1861, 'Хліб "Жит-Пш з льоном"'),
    832:  (1870, 'Багет Француз'),
    833:  (1884, 'Багет Гречаний'),
    837:  (1869, 'Багет Фітнес'),
    1147: (2285, 'Багет класичний'),
    880:  (1955, 'Батон'),
}

# Заповнюємо тільки до цієї дати (далі вже є в bakery1.balance_snapshots)
CUTOFF_DATE = "2026-01-19"

DRY_RUN = "--dry-run" in sys.argv


def get_existing_dates(sb):
    """Повертає множину дат які вже є в balance_snapshots"""
    res = (sb.schema("bakery1")
             .table("balance_snapshots")
             .select("snapshot_time")
             .execute())
    dates = set()
    for r in (res.data or []):
        dates.add(r["snapshot_time"][:10])
    return dates


def build_rows(df: pd.DataFrame, existing_dates: set) -> list[dict]:
    """Конвертує CSV рядки у формат balance_snapshots"""
    rows = []
    skipped_dates = 0
    skipped_map   = 0

    for _, row in df.iterrows():
        date_str = str(row["date"])[:10]

        if date_str in existing_dates:
            skipped_dates += 1
            continue

        spot_id    = int(row["store_id"])
        product_id = int(row["sku_id"])
        balance    = float(row["morning_balance"])

        storage_id = SPOT_TO_STORAGE.get(spot_id)
        product    = PRODUCT_MAP.get(product_id)

        if storage_id is None or product is None:
            skipped_map += 1
            continue

        ingredient_id, product_name = product

        # Час: вранці 08:00 за Київським часом (UTC+2)
        snapshot_time = f"{date_str}T08:00:00+02:00"

        rows.append({
            "snapshot_time": snapshot_time,
            "snapshot_type": "morning",
            "storage_id":    storage_id,
            "spot_id":       spot_id,
            "product_id":    product_id,
            "ingredient_id": ingredient_id,
            "product_name":  product_name,
            "balance_qty":   max(balance, 0),   # негативне = OOS → 0
        })

    print(f"  Пропущено (вже в БД): {skipped_dates}")
    print(f"  Пропущено (нема маппінгу): {skipped_map}")
    return rows


def upload(sb, rows: list[dict], batch_size: int = 500):
    total = len(rows)
    inserted = 0
    for i in range(0, total, batch_size):
        batch = rows[i:i + batch_size]
        if not DRY_RUN:
            sb.schema("bakery1").table("balance_snapshots").insert(batch).execute()
        inserted += len(batch)
        print(f"  {'[DRY] ' if DRY_RUN else ''}Вставлено {inserted}/{total}...", end="\r")
    print()


def verify(sb):
    """Показує перші та останні дати після завантаження"""
    first = (sb.schema("bakery1").table("balance_snapshots")
               .select("snapshot_time").order("snapshot_time", desc=False).limit(1).execute())
    last  = (sb.schema("bakery1").table("balance_snapshots")
               .select("snapshot_time").order("snapshot_time", desc=True).limit(1).execute())
    f = first.data[0]["snapshot_time"][:10] if first.data else "?"
    l = last.data[0]["snapshot_time"][:10]  if last.data  else "?"
    print(f"\nПеріод у balance_snapshots: {f} → {l}")


def main():
    print(f"{'=== DRY RUN ===' if DRY_RUN else '=== UPLOAD ==='}")
    print(f"Cutoff дата: < {CUTOFF_DATE}\n")

    # Завантажуємо CSV
    df = pd.read_csv(CSV_PATH, parse_dates=["date"])
    df["date"] = pd.to_datetime(df["date"]).dt.date.astype(str)
    df = df[df["date"] < CUTOFF_DATE]
    print(f"CSV рядків до {CUTOFF_DATE}: {len(df)}")
    print(f"Дати: {df['date'].min()} → {df['date'].max()}")
    print(f"Spot IDs: {sorted(df['store_id'].unique())}")
    print(f"Product IDs: {sorted(df['sku_id'].unique())}\n")

    # Supabase
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("Отримую існуючі дати...")
    existing = get_existing_dates(sb)
    print(f"  Вже є дат: {len(existing)} ({min(existing) if existing else '?'} → {max(existing) if existing else '?'})\n")

    print("Формую рядки для вставки...")
    rows = build_rows(df, existing)
    print(f"  До вставки: {len(rows)} рядків\n")

    if not rows:
        print("Нічого вставляти — дані вже є або не пройшли маппінг.")
        return

    # Статистика
    dates_in_rows = set(r["snapshot_time"][:10] for r in rows)
    print(f"  Унікальних дат: {len(dates_in_rows)}")
    print(f"  Перша: {min(dates_in_rows)}")
    print(f"  Остання: {max(dates_in_rows)}")
    print(f"  Spot IDs: {sorted(set(r['spot_id'] for r in rows))}")
    print(f"  Product IDs: {sorted(set(r['product_id'] for r in rows))}\n")

    print("Завантажую у Supabase...")
    upload(sb, rows)

    if not DRY_RUN:
        verify(sb)

    print(f"\n{'DRY RUN завершено' if DRY_RUN else 'Готово!'}")


if __name__ == "__main__":
    main()
