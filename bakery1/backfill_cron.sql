-- Бекфіл daily_oos: pg_cron задачі (запустити в Supabase SQL Editor)

-- 1. Видаляємо старі backfill задачі якщо є
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname LIKE 'bf-%';

-- 2. Плануємо задачі (всі запустяться протягом наступної хвилини)
SELECT cron.schedule('bf-2026-01-01', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-01'::date)$$);
SELECT cron.schedule('bf-2026-01-02', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-02'::date)$$);
SELECT cron.schedule('bf-2026-01-03', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-03'::date)$$);
SELECT cron.schedule('bf-2026-01-04', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-04'::date)$$);
SELECT cron.schedule('bf-2026-01-05', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-05'::date)$$);
SELECT cron.schedule('bf-2026-01-06', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-06'::date)$$);
SELECT cron.schedule('bf-2026-01-07', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-07'::date)$$);
SELECT cron.schedule('bf-2026-01-08', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-08'::date)$$);
SELECT cron.schedule('bf-2026-01-09', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-09'::date)$$);
SELECT cron.schedule('bf-2026-01-10', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-10'::date)$$);
SELECT cron.schedule('bf-2026-01-11', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-11'::date)$$);
SELECT cron.schedule('bf-2026-01-12', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-12'::date)$$);
SELECT cron.schedule('bf-2026-01-13', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-13'::date)$$);
SELECT cron.schedule('bf-2026-01-14', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-14'::date)$$);
SELECT cron.schedule('bf-2026-01-15', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-15'::date)$$);
SELECT cron.schedule('bf-2026-01-16', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-16'::date)$$);
SELECT cron.schedule('bf-2026-01-17', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-17'::date)$$);
SELECT cron.schedule('bf-2026-01-18', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-18'::date)$$);
SELECT cron.schedule('bf-2026-01-19', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-19'::date)$$);
SELECT cron.schedule('bf-2026-01-20', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-20'::date)$$);
SELECT cron.schedule('bf-2026-01-21', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-21'::date)$$);
SELECT cron.schedule('bf-2026-01-22', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-22'::date)$$);
SELECT cron.schedule('bf-2026-01-23', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-23'::date)$$);
SELECT cron.schedule('bf-2026-01-24', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-24'::date)$$);
SELECT cron.schedule('bf-2026-01-25', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-25'::date)$$);
SELECT cron.schedule('bf-2026-01-26', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-26'::date)$$);
SELECT cron.schedule('bf-2026-01-27', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-27'::date)$$);
SELECT cron.schedule('bf-2026-01-28', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-28'::date)$$);
SELECT cron.schedule('bf-2026-01-29', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-29'::date)$$);
SELECT cron.schedule('bf-2026-01-30', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-30'::date)$$);
SELECT cron.schedule('bf-2026-01-31', '* * * * *', $$CALL bakery1.populate_daily_oos('2026-01-31'::date)$$);

-- Заплановано 31 дат: 2026-01-01 → 2026-01-31
-- Зачекай 2-3 хвилини, потім запусти UNSCHEDULE нижче:

-- 3. ПІСЛЯ виконання — прибираємо задачі:
-- SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'bf-%';