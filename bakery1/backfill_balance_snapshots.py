"""
Бэкфилл bakery1.balance_snapshots из leftovers.daily_snapshots
Заполняет историю с 2026-01-19 по вчера (сегодня уже есть реальный снимок)
"""
import os
from pathlib import Path
from datetime import date, datetime, timezone, timedelta
from supabase import create_client

# ── .env.local ────────────────────────────────────────────────────────
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

# spot_id → storage_id (верифіковано через Poster API storage.getStorages 2026-03-22)
SPOT_TO_STORAGE = {
    1:  45,  # Бульвар
    2:  44,  # Білоруська
    3:   5,  # Героїв Майдану
    4:   9,  # Герцена
    5:   2,  # Гравітон
    6:  20,  # Ентузіастів
    7:  47,  # Квартал
    8:   3,  # Кварц
    9:  33,  # Київ
    12: 52,  # Клуб
    13: 21,  # Комарова 26
    14: 53,  # Компас
    15: 43,  # Мікрорайон
    16:  7,  # Проспект
    17: 55,  # Роша
    18:  6,  # Руська
    19: 36,  # Рівненська
    20: 34,  # Садова
    21: 39,  # Хотинська
    22: 30,  # Черемош
    23:  8,  # Шкільна
}
STORAGE_TO_SPOT = {v: k for k, v in SPOT_TO_STORAGE.items()}

# ingredient_id → (product_id, product_name)
BREAD_MAP = {
    1859: (768,  'Хліб "Француз"'),
    1898: (849,  'Хліб "Француз з цибулею"'),
    1862: (839,  'Хліб "Житньо-Пшеничний"'),
    1865: (843,  'Хліб "Тартін"'),
    1866: (778,  'Хліб "Гречаний"'),
    1867: (772,  'Хліб "Солодовий з журавлиною"'),
    1864: (774,  'Хліб "Злаковий"'),
    1888: (780,  'Хліб "Висівковий"'),
    1861: (776,  'Хліб "Жит-Пш з льоном"'),
    1870: (832,  'Багет Француз'),
    1884: (833,  'Багет Гречаний'),
    1869: (837,  'Багет Фітнес'),
    2285: (1147, 'Багет класичний'),
    1955: (880,  'Батон'),
}
INGREDIENT_IDS = list(BREAD_MAP.keys())

def run():
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    today = date.today().isoformat()

    print(f"Читаємо leftovers.daily_snapshots (до {today} включно виключаємо сьогодні)...")

    # Читаємо всі потрібні рядки з leftovers (по 1000 за раз, pagination)
    all_rows = []
    offset = 0
    batch = 1000
    while True:
        res = (
            sb.schema("leftovers")
            .table("daily_snapshots")
            .select("snapshot_date,storage_id,ingredient_id,ingredient_name,storage_ingredient_left")
            .in_("ingredient_id", INGREDIENT_IDS)
            .in_("storage_id", list(STORAGE_TO_SPOT.keys()))
            .lt("snapshot_date", today)
            .range(offset, offset + batch - 1)
            .execute()
        )
        rows = res.data or []
        all_rows.extend(rows)
        print(f"  Отримано {offset + len(rows)} рядків...", end="\r")
        if len(rows) < batch:
            break
        offset += batch

    print(f"\nВсього рядків з leftovers: {len(all_rows)}")

    # Перевіряємо які дати вже є в balance_snapshots
    existing = (
        sb.schema("bakery1")
        .table("balance_snapshots")
        .select("snapshot_time")
        .execute()
    )
    existing_dates = set()
    for r in (existing.data or []):
        dt = r["snapshot_time"][:10]  # YYYY-MM-DD
        existing_dates.add(dt)
    print(f"Вже є в balance_snapshots: {sorted(existing_dates)}")

    # Формуємо рядки для вставки
    insert_rows = []
    skipped = 0
    for r in all_rows:
        snap_date = r["snapshot_date"]
        if snap_date in existing_dates:
            skipped += 1
            continue

        storage_id = r["storage_id"]
        ing_id = r["ingredient_id"]
        spot_id = STORAGE_TO_SPOT.get(storage_id)
        bread = BREAD_MAP.get(ing_id)

        if not spot_id or not bread:
            continue

        product_id, product_name = bread
        balance = max(float(r.get("storage_ingredient_left") or 0), 0)

        # Час знімку: 21:30 київського часу (UTC+2 → +3 влітку, але беремо фіксовано вечір)
        snapshot_time = f"{snap_date}T21:30:00+02:00"

        insert_rows.append({
            "snapshot_time": snapshot_time,
            "snapshot_type": "evening",
            "storage_id":    storage_id,
            "spot_id":       spot_id,
            "product_id":    product_id,
            "ingredient_id": ing_id,
            "product_name":  product_name,
            "balance_qty":   balance,
        })

    print(f"Пропущено (вже є): {skipped}, до вставки: {len(insert_rows)}")

    if not insert_rows:
        print("Нічого вставляти.")
        return

    # Вставляємо батчами по 500
    batch_size = 500
    total_inserted = 0
    for i in range(0, len(insert_rows), batch_size):
        batch = insert_rows[i:i + batch_size]
        sb.schema("bakery1").table("balance_snapshots").insert(batch).execute()
        total_inserted += len(batch)
        print(f"  Вставлено {total_inserted}/{len(insert_rows)}...", end="\r")

    print(f"\nГотово! Вставлено {total_inserted} рядків у bakery1.balance_snapshots")

    # Перевірка
    check = (
        sb.schema("bakery1")
        .table("balance_snapshots")
        .select("snapshot_time,spot_id,product_id,balance_qty")
        .order("snapshot_time", desc=True)
        .limit(5)
        .execute()
    )
    print("\nОстанні 5 рядків:")
    for r in (check.data or []):
        print(f"  {r['snapshot_time'][:10]} spot={r['spot_id']} product={r['product_id']} balance={r['balance_qty']}")

if __name__ == "__main__":
    run()
