"""
Генерує SQL файл з pg_cron задачами для бекфілу.
Запускається один раз, потім SQL вставляється в Supabase SQL Editor.
"""
from datetime import date, timedelta
from pathlib import Path

# Дати для обробки
EXISTING  = set()  # заповнюється автоматично нижче
date_from = date(2026, 1, 1)
date_to   = date(2026, 1, 31)

dates = []
d = date_from
while d <= date_to:
    if d.isoformat() not in EXISTING:
        dates.append(d)
    d += timedelta(days=1)

lines = ["-- Бекфіл daily_oos: pg_cron задачі (запустити в Supabase SQL Editor)\n"]

# Спочатку видаляємо старі задачі з таким же префіксом
lines.append("-- 1. Видаляємо старі backfill задачі якщо є")
lines.append("SELECT cron.unschedule(jobname)")
lines.append("FROM cron.job")
lines.append("WHERE jobname LIKE 'bf-%';\n")

# Плануємо всі дати
lines.append("-- 2. Плануємо задачі (всі запустяться протягом наступної хвилини)")
for d in dates:
    job_name = f"bf-{d.isoformat()}"
    lines.append(
        f"SELECT cron.schedule('{job_name}', '* * * * *', "
        f"$$CALL bakery1.populate_daily_oos('{d.isoformat()}'::date)$$);"
    )

lines.append(f"\n-- Заплановано {len(dates)} дат: {dates[0]} → {dates[-1]}")
lines.append("-- Зачекай 2-3 хвилини, потім запусти UNSCHEDULE нижче:\n")

# Unschedule блок
lines.append("-- 3. ПІСЛЯ виконання — прибираємо задачі:")
lines.append("-- SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'bf-%';")

sql = "\n".join(lines)

out = Path(__file__).parent / "backfill_cron.sql"
out.write_text(sql, encoding="utf-8")
print(f"Згенеровано: {out}")
print(f"Дат для обробки: {len(dates)}")
print(f"Відкрий файл і встав у Supabase SQL Editor")
