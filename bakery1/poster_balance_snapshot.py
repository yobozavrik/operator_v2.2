"""
Знімок залишків хліба з Poster → Supabase bakery1.balance_snapshots
Запускається двічі на день: 08:00 (morning) і 21:30 (evening)

Використовує: storage.getStorageLeftovers (per storage_id)
Зберігає:     bakery1.balance_snapshots
"""
import os
import sys
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from supabase import create_client

# ── Завантаження .env.local ──────────────────────────────────────
def _load_env():
    env_file = Path(__file__).resolve().parent.parent / ".env.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

_load_env()

# ── Конфігурація ────────────────────────────────────────────────
POSTER_TOKEN  = os.environ.get("POSTER_TOKEN", "526379:996915581eb0d8885af8187640385157")
SUPABASE_URL  = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
POSTER_BASE   = "https://joinposter.com/api"

# Категорія "Крафтовий хліб" — ingredient_id → product_id
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

# Маппінг spot_id → storage_id (активні магазини)
# Верифіковано через Poster API storage.getStorages 2026-03-22
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

# ── Poster API ───────────────────────────────────────────────────
def get_storage_leftovers(storage_id: int) -> dict[int, float]:
    """Повертає {ingredient_id: balance_qty} для конкретного складу."""
    url = f"{POSTER_BASE}/storage.getStorageLeftovers?token={POSTER_TOKEN}&storage_id={storage_id}"
    with urllib.request.urlopen(url) as r:
        data = json.loads(r.read())

    if "error" in data:
        raise RuntimeError(f"Poster API error: {data['error']}")

    result = {}
    for item in data.get("response", []):
        ing_id = int(item["ingredient_id"])
        if ing_id in BREAD_MAP:
            result[ing_id] = float(item.get("storage_ingredient_left") or 0)
    return result

# ── Main ─────────────────────────────────────────────────────────
def run_snapshot(snapshot_type: str):
    """
    snapshot_type: 'morning' (08:00) або 'evening' (21:30)
    """
    now = datetime.now(timezone.utc)
    print(f"[{now.isoformat()}] Snapshot: {snapshot_type}")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    rows = []
    errors = []

    for spot_id, storage_id in SPOT_TO_STORAGE.items():
        try:
            leftovers = get_storage_leftovers(storage_id)
            for ing_id, balance in leftovers.items():
                product_id, product_name = BREAD_MAP[ing_id]
                rows.append({
                    "snapshot_time": now.isoformat(),
                    "snapshot_type": snapshot_type,
                    "storage_id":    storage_id,
                    "spot_id":       spot_id,
                    "product_id":    product_id,
                    "ingredient_id": ing_id,
                    "product_name":  product_name,
                    "balance_qty":   max(balance, 0),  # негативні = 0
                })
            print(f"  spot={spot_id:>2} storage={storage_id:>2}: {len(leftovers)} SKU зчитано")
        except Exception as e:
            errors.append(f"spot={spot_id}: {e}")
            print(f"  spot={spot_id:>2} ERROR: {e}")

    if rows:
        result = supabase.schema("bakery1").table("balance_snapshots").insert(rows).execute()
        print(f"\nЗбережено {len(rows)} рядків у bakery1.balance_snapshots")

    if errors:
        print(f"\nПомилки ({len(errors)}):")
        for e in errors:
            print(f"  {e}")

    return len(rows), errors

# ── Entry point ──────────────────────────────────────────────────
if __name__ == "__main__":
    # Визначаємо тип знімку по часу або з аргументу
    if len(sys.argv) > 1:
        stype = sys.argv[1]  # python poster_balance_snapshot.py morning
    else:
        hour = datetime.now().hour
        stype = "morning" if 6 <= hour < 12 else "evening"

    print(f"Тип знімку: {stype}")
    saved, errs = run_snapshot(stype)
    sys.exit(1 if errs and saved == 0 else 0)
