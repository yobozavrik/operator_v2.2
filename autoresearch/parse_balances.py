"""
parse_balances.py — Парсить Excel-залишки з balance_exports/ → morning_balance.csv
====================================================================================
Запуск:
    python parse_balances.py

Вихідний файл: D:/operator-main/autoresearch/morning_balance.csv
Колонки: date, store_id, sku_id, morning_balance
"""

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import pandas as pd
import re
from pathlib import Path

BALANCE_DIR = Path("C:/Users/dmytr/Downloads/balance_exports")
OUTPUT_CSV  = Path("D:/operator-main/autoresearch/morning_balance.csv")

# ── Маппінг: ім'я магазину в Excel → spot_id у Supabase ───────────────
STORE_MAP = {
    'Магазин "Бульвар"':         1,
    'Магазин "Білоруська"':      2,
    'Магазин "Героїв Майдану"':  3,
    'Магазин "Герцена"':         4,
    'Магазин "Гравітон"':        5,
    'Магазин "Ентузіастів"':     6,
    'Магазин "Квартал"':         7,
    'Магазин "Кварц"':           8,
    'Магазин "Київ"':            9,
    'Магазин "Клуб"':           12,
    'Магазин "Комарова 26 круг"':13,
    'Магазин "Компас"':         14,
    'Магазин "Мікрорайон"':     15,
    'Магазин "Проспект"':       16,
    'Магазин "Роша"':           17,
    'Магазин "Руська"':         18,
    'Магазин "Рівненська"':     19,
    'Магазин "Садова"':         20,
    'Магазин "Хотинська"':      21,
    'Магазин "Черемош"':        22,
    'Магазин "Шкільна"':        23,
}

# ── Маппінг: ім'я SKU в Excel → sku_id у Supabase ─────────────────────
SKU_MAP = {
    'Хліб "Француз"':               768,
    'Хліб "Солодовий з журавлиною"': 772,
    'Хліб "Злаковий"':              774,
    'Хліб "Жит-Пш з льоном"':      776,
    'Хліб "Гречаний"':              778,
    'Хліб "Висівковий"':            780,
    'Багет Француз':                832,
    'Багет француз':                832,   # варіант з малою ф (старі файли)
    'Багет Гречаний':               833,
    'Багет Фітнес':                 837,
    'Хліб "Житньо-Пшеничний"':     839,
    'Хліб "Тартін"':                843,
    'Хліб "Француз з цибулею"':    849,
    'Батон':                        880,
    'Багет класичний':             1147,
}

BREAD_CATEGORIES = {"Пекарня", "Крафтовий хліб", "Хлібобулочні вироби"}


def parse_file(path: Path) -> pd.DataFrame:
    """Повертає DataFrame з колонками: store_id, sku_id, morning_balance"""
    # Дата з назви файлу (YYYYMMDD_...)
    m = re.match(r"(\d{8})_", path.name)
    if not m:
        return pd.DataFrame()
    date = pd.Timestamp(m.group(1))

    try:
        df = pd.read_excel(path, sheet_name=0, header=None)
    except Exception as e:
        print(f"  ERROR reading {path.name}: {e}")
        return pd.DataFrame()

    df.columns = range(len(df.columns))
    # Row 1 = header, rows 2+ = data
    df = df.iloc[2:].reset_index(drop=True)
    df = df.rename(columns={1: "name", 2: "store", 4: "category", 5: "balance"})

    # Фільтр по категоріях (хліб)
    df = df[df["category"].isin(BREAD_CATEGORIES)].copy()
    if df.empty:
        return pd.DataFrame()

    # Маппінг store → store_id
    df["store_id"] = df["store"].map(STORE_MAP)
    df = df[df["store_id"].notna()].copy()

    # Маппінг name → sku_id
    df["sku_id"] = df["name"].map(SKU_MAP)
    df = df[df["sku_id"].notna()].copy()

    if df.empty:
        return pd.DataFrame()

    # Парсинг balance: "2,00" → 2.0
    df["morning_balance"] = (
        df["balance"].astype(str)
        .str.replace(",", ".", regex=False)
        .str.replace(" ", "", regex=False)
        .pipe(pd.to_numeric, errors="coerce")
        .fillna(0)
    )

    df["date"]     = date
    df["store_id"] = df["store_id"].astype(int)
    df["sku_id"]   = df["sku_id"].astype(int)

    return df[["date", "store_id", "sku_id", "morning_balance"]]


def main():
    files = sorted(BALANCE_DIR.glob("*.xlsx"))
    print(f"Знайдено файлів: {len(files)}")

    all_parts = []
    ok = 0
    skip = 0

    for f in files:
        part = parse_file(f)
        if part.empty:
            skip += 1
        else:
            all_parts.append(part)
            ok += 1

    if not all_parts:
        print("Жодного хлібного запису не знайдено!")
        return

    result = pd.concat(all_parts, ignore_index=True)

    # Дедуп: якщо є дублікати (два файли з одним днем) — беремо перший
    result = result.drop_duplicates(subset=["date", "store_id", "sku_id"], keep="first")
    result = result.sort_values(["date", "store_id", "sku_id"]).reset_index(drop=True)

    result.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")

    print(f"\nПарсинг завершено:")
    print(f"  Файлів оброблено: {ok} | пропущено: {skip}")
    print(f"  Унікальних записів: {len(result)}")
    print(f"  Дати: {result['date'].min().date()} → {result['date'].max().date()}")
    print(f"  Магазини: {sorted(result['store_id'].unique())}")
    print(f"  SKU: {sorted(result['sku_id'].unique())}")
    print(f"\nЗбережено: {OUTPUT_CSV}")

    # Статистика по дням
    daily = result.groupby("date")["morning_balance"].agg(["count","sum","mean"])
    print(f"\nПерші/останні дні:")
    print(daily.head(5).to_string())
    print("...")
    print(daily.tail(5).to_string())


if __name__ == "__main__":
    main()
