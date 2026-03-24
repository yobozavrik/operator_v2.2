"""
check_balance_dq.py — Перевірка якості даних парсера balance_exports
=====================================================================
1. Парсить ОДИН файл → показує сирі дані
2. Запускає всі файли → повна DQ статистика
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import pandas as pd
import numpy as np
import re
from pathlib import Path

BALANCE_DIR = Path("C:/Users/dmytr/Downloads/balance_exports")

STORE_MAP = {
    'Магазин "Бульвар"':          1,
    'Магазин "Білоруська"':       2,
    'Магазин "Героїв Майдану"':   3,
    'Магазин "Герцена"':          4,
    'Магазин "Гравітон"':         5,
    'Магазин "Ентузіастів"':      6,
    'Магазин "Квартал"':          7,
    'Магазин "Кварц"':            8,
    'Магазин "Київ"':             9,
    'Магазин "Клуб"':            12,
    'Магазин "Комарова 26 круг"':13,
    'Магазин "Компас"':          14,
    'Магазин "Мікрорайон"':      15,
    'Магазин "Проспект"':        16,
    'Магазин "Роша"':            17,
    'Магазин "Руська"':          18,
    'Магазин "Рівненська"':      19,
    'Магазин "Садова"':          20,
    'Магазин "Хотинська"':       21,
    'Магазин "Черемош"':         22,
    'Магазин "Шкільна"':         23,
}

SKU_MAP = {
    'Хліб "Француз"':               768,
    'Хліб "Солодовий з журавлиною"': 772,
    'Хліб "Злаковий"':              774,
    'Хліб "Жит-Пш з льоном"':      776,
    'Хліб "Гречаний"':              778,
    'Хліб "Висівковий"':            780,
    'Багет Француз':                832,
    'Багет Гречаний':               833,
    'Багет Фітнес':                 837,
    'Хліб "Житньо-Пшеничний"':     839,
    'Хліб "Тартін"':                843,
    'Хліб "Француз з цибулею"':    849,
    'Батон':                        880,
    'Багет класичний':             1147,
}

BREAD_CATEGORIES = {"Пекарня", "Крафтовий хліб", "Хлібобулочні вироби"}


# ══════════════════════════════════════════════
# ЧАСТИНА 1: Сирий огляд ОДНОГО файлу
# ══════════════════════════════════════════════
def inspect_raw(path: Path):
    print("=" * 60)
    print(f"RAW INSPECT: {path.name}")
    print("=" * 60)

    df = pd.read_excel(path, sheet_name=0, header=None)
    df.columns = range(len(df.columns))

    print(f"\nРозмір: {df.shape[0]} рядків × {df.shape[1]} колонок")
    print(f"\nПерші 5 рядків (RAW):")
    print(df.head(5).to_string())

    print(f"\nКолонки [1=name, 2=store, 4=category, 5=balance]:")
    data = df.iloc[2:].copy()
    data = data.rename(columns={1: "name", 2: "store", 4: "category", 5: "balance"})

    # Унікальні категорії
    cats = data["category"].dropna().unique()
    print(f"\nУсі категорії ({len(cats)}):")
    for c in sorted(cats, key=str):
        print(f"  '{c}'")

    # Хлібні рядки
    bread = data[data["category"].isin(BREAD_CATEGORIES)].copy()
    print(f"\nХлібних рядків: {len(bread)}")

    # Унікальні магазини в хлібних рядках
    stores = bread["store"].dropna().unique()
    print(f"\nМагазини в хлібних рядках ({len(stores)}):")
    unmapped_stores = []
    for s in sorted(stores, key=str):
        sid = STORE_MAP.get(s, "?? НЕ ЗНАЙДЕНО")
        print(f"  '{s}' → {sid}")
        if sid == "?? НЕ ЗНАЙДЕНО":
            unmapped_stores.append(s)

    # Унікальні SKU в хлібних рядках
    skus = bread["name"].dropna().unique()
    print(f"\nSKU в хлібних рядках ({len(skus)}):")
    unmapped_skus = []
    for s in sorted(skus, key=str):
        sid = SKU_MAP.get(s, "?? НЕ ЗНАЙДЕНО")
        print(f"  '{s}' → {sid}")
        if sid == "?? НЕ ЗНАЙДЕНО":
            unmapped_skus.append(s)

    # Баланс
    print(f"\nПриклади значень balance:")
    print(bread["balance"].head(20).to_string())

    # Конвертація балансу
    bread["bal_num"] = (
        bread["balance"].astype(str)
        .str.replace(",", ".", regex=False)
        .str.replace(" ", "", regex=False)
        .pipe(pd.to_numeric, errors="coerce")
    )
    print(f"\nПісля конвертації:")
    print(f"  NaN: {bread['bal_num'].isna().sum()}")
    print(f"  Від'ємні: {(bread['bal_num'] < 0).sum()}")
    print(f"  Нульові: {(bread['bal_num'] == 0).sum()}")
    print(f"  Додатні: {(bread['bal_num'] > 0).sum()}")
    print(f"  Min: {bread['bal_num'].min():.2f}  Max: {bread['bal_num'].max():.2f}  Mean: {bread['bal_num'].mean():.2f}")

    return unmapped_stores, unmapped_skus


# ══════════════════════════════════════════════
# ЧАСТИНА 2: DQ по ВСІХ файлах
# ══════════════════════════════════════════════
def full_dq():
    print("\n" + "=" * 60)
    print("ПОВНА DQ — ВСІ ФАЙЛИ")
    print("=" * 60)

    files = sorted(BALANCE_DIR.glob("*.xlsx"))
    print(f"Файлів знайдено: {len(files)}")

    all_rows = []
    issues = []

    for f in files:
        m = re.match(r"(\d{8})_", f.name)
        if not m:
            issues.append(f"  SKIP (no date): {f.name}")
            continue
        date = pd.Timestamp(m.group(1))

        try:
            df = pd.read_excel(f, sheet_name=0, header=None)
        except Exception as e:
            issues.append(f"  ERROR: {f.name}: {e}")
            continue

        df.columns = range(len(df.columns))
        data = df.iloc[2:].copy()
        data = data.rename(columns={1: "name", 2: "store", 4: "category", 5: "balance"})

        bread = data[data["category"].isin(BREAD_CATEGORIES)].copy()
        if bread.empty:
            issues.append(f"  NO BREAD: {f.name}")
            continue

        bread["store_id"] = bread["store"].map(STORE_MAP)
        bread["sku_id"]   = bread["name"].map(SKU_MAP)
        bread["bal_num"]  = (
            bread["balance"].astype(str)
            .str.replace(",", ".", regex=False)
            .str.replace(" ", "", regex=False)
            .pipe(pd.to_numeric, errors="coerce")
        )
        bread["date"] = date

        # Unmapped
        n_store_unmapped = bread["store_id"].isna().sum()
        n_sku_unmapped   = bread["sku_id"].isna().sum()
        n_bal_nan        = bread["bal_num"].isna().sum()
        n_negative       = (bread["bal_num"] < 0).sum()

        if n_store_unmapped + n_sku_unmapped + n_bal_nan > 0:
            issues.append(
                f"  WARN {f.name}: store_unmapped={n_store_unmapped} "
                f"sku_unmapped={n_sku_unmapped} bal_nan={n_bal_nan}"
            )

        mapped = bread[bread["store_id"].notna() & bread["sku_id"].notna()].copy()
        mapped = mapped.drop_duplicates(["date", "store_id", "sku_id"])
        all_rows.append(mapped[["date", "store_id", "sku_id", "bal_num"]])

    print(f"\nПроблеми ({len(issues)}):")
    for i in issues[:30]:
        print(i)
    if len(issues) > 30:
        print(f"  ... і ще {len(issues)-30}")

    if not all_rows:
        print("Немає даних!")
        return

    df = pd.concat(all_rows, ignore_index=True)
    df.columns = ["date", "store_id", "sku_id", "morning_balance"]
    df = df.drop_duplicates(["date", "store_id", "sku_id"])

    print(f"\n── Загальна статистика ──")
    print(f"  Унікальних записів:  {len(df)}")
    print(f"  Дат:                 {df['date'].nunique()}  ({df['date'].min().date()} → {df['date'].max().date()})")
    print(f"  Магазинів:           {sorted(df['store_id'].unique())}")
    print(f"  SKU:                 {sorted(df['sku_id'].unique())}")

    print(f"\n── Розподіл балансів ──")
    print(f"  Від'ємних (OOS?):    {(df['morning_balance'] < 0).sum()} ({(df['morning_balance'] < 0).mean()*100:.1f}%)")
    print(f"  Нульових:            {(df['morning_balance'] == 0).sum()} ({(df['morning_balance'] == 0).mean()*100:.1f}%)")
    print(f"  Додатних:            {(df['morning_balance'] > 0).sum()} ({(df['morning_balance'] > 0).mean()*100:.1f}%)")
    print(f"  Min: {df['morning_balance'].min():.1f}  Max: {df['morning_balance'].max():.1f}  Mean: {df['morning_balance'].mean():.2f}")

    print(f"\n── Покриття: скільки магазинів на день ──")
    cov = df.groupby("date")["store_id"].nunique()
    print(f"  Середнє:  {cov.mean():.1f} магазинів/день")
    print(f"  Мінімум:  {cov.min()} (дата: {cov.idxmin().date()})")
    print(f"  Максимум: {cov.max()} (дата: {cov.idxmax().date()})")

    # Дні з малим покриттям
    bad_days = cov[cov < 15]
    if not bad_days.empty:
        print(f"\n  Дні з < 15 магазинів ({len(bad_days)}):")
        for d, n in bad_days.items():
            print(f"    {d.date()}: {n} магазинів")

    print(f"\n── Покриття по SKU (% днів де є дані) ──")
    sku_cov = df.groupby("sku_id")["date"].nunique()
    n_dates = df["date"].nunique()
    for sku, cnt in sku_cov.sort_values(ascending=False).items():
        print(f"  sku={sku}: {cnt}/{n_dates} днів ({cnt/n_dates*100:.0f}%)")

    print(f"\n── Пропущені дати (gaps) ──")
    all_dates = pd.date_range(df['date'].min(), df['date'].max(), freq='D')
    present   = set(df['date'].dt.normalize().unique())
    missing   = [d for d in all_dates if d not in present]
    print(f"  Пропущено {len(missing)} з {len(all_dates)} днів")
    if missing[:20]:
        print(f"  Приклади: {[d.date() for d in missing[:20]]}")


if __name__ == "__main__":
    # Один файл — детальний огляд
    sample = sorted(BALANCE_DIR.glob("*.xlsx"))[0]
    unmapped_s, unmapped_k = inspect_raw(sample)

    # Всі файли — DQ
    full_dq()
