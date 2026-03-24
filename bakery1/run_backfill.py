"""
Бекфіл daily_oos за вказаний діапазон дат.
Викликає bakery1.populate_daily_oos(date) для кожного дня окремо.
Обходить обмеження таймауту Supabase SQL Editor.

Запуск:
  python bakery1/run_backfill.py                        # весь березень 2026
  python bakery1/run_backfill.py 2026-02-01 2026-03-14  # свій діапазон
"""

import os
import sys
import time
from pathlib import Path
from datetime import date, timedelta
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent

def _load_env():
    env_file = ROOT / ".env.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

_load_env()

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


def run_backfill(date_from: date, date_to: date):
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Які дати вже є
    rows = (
        supabase.schema("bakery1")
        .table("daily_oos")
        .select("date")
        .gte("date", date_from.isoformat())
        .lte("date", date_to.isoformat())
        .execute()
        .data
    )
    existing = {r["date"] for r in rows}

    # Всі дати в діапазоні
    all_dates = []
    d = date_from
    while d <= date_to:
        all_dates.append(d)
        d += timedelta(days=1)

    to_process = [d for d in all_dates if d.isoformat() not in existing]

    if not to_process:
        print(f"Всі дати {date_from} → {date_to} вже є в daily_oos.")
        return

    print(f"Діапазон:   {date_from} → {date_to}")
    print(f"Вже є:      {len(existing)} дат")
    print(f"Обробити:   {len(to_process)} дат")
    print()

    ok = 0
    fail = 0

    for i, d in enumerate(to_process, 1):
        try:
            supabase.schema("bakery1").rpc(
                "populate_daily_oos", {"p_date": d.isoformat()}
            ).execute()
            print(f"  [{i:>3}/{len(to_process)}] ✓ {d}")
            ok += 1
        except Exception as e:
            # RPC для PROCEDURE може повертати помилку навіть при успіху —
            # перевіряємо чи дані з'явились
            check = (
                supabase.schema("bakery1")
                .table("daily_oos")
                .select("date", count="exact")
                .eq("date", d.isoformat())
                .execute()
            )
            if check.count and check.count > 0:
                print(f"  [{i:>3}/{len(to_process)}] ✓ {d}  (через SQL)")
                ok += 1
            else:
                # Fallback: через execute_sql якщо rpc не підтримує PROCEDURE
                try:
                    supabase.rpc("exec_sql", {
                        "query": f"CALL bakery1.populate_daily_oos('{d.isoformat()}'::date)"
                    }).execute()
                    print(f"  [{i:>3}/{len(to_process)}] ✓ {d}  (exec_sql)")
                    ok += 1
                except Exception as e2:
                    print(f"  [{i:>3}/{len(to_process)}] ✗ {d}  ERROR: {e2}")
                    fail += 1

        # Невелика пауза щоб не перевантажити БД
        time.sleep(0.5)

    print()
    print(f"Готово. Успішно: {ok}  Помилки: {fail}")

    # Фінальна перевірка
    result = (
        supabase.schema("bakery1")
        .table("daily_oos")
        .select("date", count="exact")
        .gte("date", date_from.isoformat())
        .lte("date", date_to.isoformat())
        .execute()
    )
    print(f"Рядків у daily_oos за {date_from}→{date_to}: {result.count}")


if __name__ == "__main__":
    if len(sys.argv) == 3:
        date_from = date.fromisoformat(sys.argv[1])
        date_to   = date.fromisoformat(sys.argv[2])
    elif len(sys.argv) == 1:
        # За замовчуванням: весь березень до вчора
        date_from = date(2026, 3, 1)
        date_to   = date.today() - timedelta(days=1)
    else:
        print("Використання: python bakery1/run_backfill.py [YYYY-MM-DD YYYY-MM-DD]")
        sys.exit(1)

    run_backfill(date_from, date_to)
