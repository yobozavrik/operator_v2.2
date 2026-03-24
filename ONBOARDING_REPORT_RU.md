# Operator (Galia Baluvana) — Технический onboarding-отчет

Дата: 10 марта 2026  
Репозиторий: `D:\Начальник виробництва`

## 1) Краткий вывод

Проект соответствует заявленной архитектуре: Next.js (App Router) + Supabase (PostgreSQL, несколько схем) + интеграция Poster API с live-слиянием данных на backend.  
Критические модули и SQL-объекты из ТЗ присутствуют и используются в runtime.

## 2) Подтвержденная архитектура по коду

- Frontend: Next.js + React + TypeScript + Tailwind + SWR.
  - Основной UI по кондитерке: `src/components/KonditerkaPowerMatrix.tsx`
  - Симулятор плана: `src/components/production/KonditerkaProductionSimulator.tsx`
- Backend: Next.js API routes в `src/app/api/*`.
- Auth: `src/lib/auth-guard.ts` (`requireAuth()`), применяется в API-обработчиках.
- Supabase client:
  - server-side: `src/utils/supabase/server` (используется в API)
  - shared client: `src/lib/supabase.ts`
- Poster integration:
  - HTTP-клиент и методы: `src/lib/poster-api.ts`
  - merge live остатков в данные SQL view: `src/lib/poster-merger.ts`

## 3) Ключевые data-flow (как работает система)

### 3.1 Кондитерка: API заказов с live остатками

1. API `GET /api/konditerka/orders`  
2. Чтение `konditerka1.v_konditerka_distribution_stats` из Supabase  
3. Параллельный запрос live остатков из Poster (`getAllLeftovers`)  
4. In-memory merge (`mergeWithPosterLiveStock`)  
5. Пересчет `need_net` на лету: `max(0, min_stock - stock_now)`  
6. Возврат объединенного результата клиенту

Файл: `src/app/api/konditerka/orders/route.ts`

### 3.2 Обновление стоков (без записи в БД)

- API `POST /api/konditerka/update-stock` делает `getAllLeftovers()` + `getTodayManufactures()` и сразу возвращает payload.  
- Это runtime-режим «получить из Poster сейчас», а не ETL-запись в таблицы.

Файл: `src/app/api/konditerka/update-stock/route.ts`

### 3.3 Симулятор производства

- Frontend вызывает RPC `f_plan_konditerka_production_ndays` через Supabase client.  
- RPC использует view `konditerka1.v_konditerka_distribution_stats` как baseline и моделирует дни/мощность.

Файлы:
- `src/components/production/KonditerkaProductionSimulator.tsx`
- `supabase/migrations/20260310_konditerka_simulator_fix.sql`

## 4) SQL-слой (что важно команде Data/Analytics)

Подтверждено в миграциях:

- `konditerka1.v_konditerka_distribution_stats`  
  - Источник: `supabase/migrations/20260309_konditerka_leftovers.sql`
  - Логика: агрегирует `avg_sales_day`, `min_stock`, `stock_now`, `baked_at_factory`, `need_net`.
- `public.f_plan_konditerka_production_ndays(p_days, p_capacity)`  
  - Источник: `supabase/migrations/20260310_konditerka_simulator_fix.sql`
  - Логика: симуляция приоритизированного плана с виртуальными стоками по дням.

Также в репозитории есть набор модульных миграций по дистрибуции (`20260208_distribution_module*.sql`, `20260212_graviton_distribution_v2.sql`, и др.).

## 5) Проверка соответствия бизнес-алгоритмам из ТЗ

- Дефицит: реализован как `need_net = max(0, min_stock - stock_now)` (SQL + JS merge-слой).
- Фильтрация складов производства при расчете розницы: в `poster-api.ts` исключаются склады с признаками `"Склад Кондитерка"`, `"цех"`, `"переміщення"`, `"списання"`.
- Единицы измерения: есть преобразование для кг/г в merge/transform слоях (`transformers.ts`, `poster-merger.ts` + словари единиц).
- Приоритезация/распределение: присутствует в UI-алгоритмах матрицы и в SQL/RPC логике симулятора.

## 6) CI/CD и DevOps статус

- CI workflow найден: `.github/workflows/ci.yml`  
  - Шаги: `npm ci`, `npm run lint`, `tsc --noEmit`, `npm run build`, `npm audit`.
- `vercel.json` в корне отсутствует (конфигурация, вероятно, в настройках Vercel UI).
- `next.config.ts` содержит security headers.

## 7) Локальный запуск: фактическая проверка

Что проверено:

- Зависимости и скрипты присутствуют (`package.json`).
- Ключевые env-переменные в `.env.local` есть (проверены только имена, без значений).

Что мешает smoke-run:

- `npm run dev` в текущем shell может резолвиться в локальный файл `npm` в корне проекта.
- При запуске `npm.cmd run dev` Next стартует, но не получает lock: уже запущен другой `next dev` процесс (`.next/dev/lock` занят, порт 3000 занят).

## 8) Риски и замечания

1. `README.md` сейчас шаблонный (create-next-app) и не отражает реальную архитектуру проекта.  
2. Есть расхождение между «sync через n8n в БД» и текущим runtime-паттерном в `konditerka` (live fetch + merge без записи). Это стоит явно задокументировать как целевой режим.  
3. На рабочей машине много `node` процессов; для стабильного dev-flow нужен единый сценарий старта/остановки.

## 9) Практический план onboarding (по ролям)

### Data Engineers / Analysts

1. Пройти миграции в порядке дат: `supabase/migrations/*.sql`.  
2. Зафиксировать lineage для:
   - `konditerka1.v_konditerka_distribution_stats`
   - `public.f_plan_konditerka_production_ndays`
3. Проверить соответствие единиц измерения в словарях и SQL-агрегациях.  
4. Подготовить краткую ER + data-flow схему по `pizza1/konditerka1/graviton/public`.

### Backend Engineers

1. Разобрать связку:
   - `src/lib/poster-api.ts`
   - `src/lib/poster-merger.ts`
   - `src/app/api/konditerka/orders/route.ts`
2. Пройти все API с `requireAuth()` и проверить единообразие 401/500 ответов.  
3. Проверить fallback-логику при падении Poster API (данные из БД должны возвращаться безопасно).  
4. Уточнить стратегию кеширования и rate-limit для Poster.

### Frontend Engineers

1. Изучить:
   - `src/components/KonditerkaPowerMatrix.tsx`
   - `src/components/production/KonditerkaProductionSimulator.tsx`
2. Проверить UX-инварианты:
   - отображение единиц (`кг/шт`)
   - корректность дефицита и распределения при нулевых остатках
3. Актуализировать технические комментарии и типы для сложных участков распределения.

### DevOps

1. Зафиксировать обязательные env в Vercel (включая Poster/Supabase ключи).  
2. Добавить runbook: как корректно останавливать старый `next dev` и запускать новый.  
3. Проверить секреты на push protection и ротацию ключей.  
4. Решить, нужен ли `vercel.json` в репозитории для явной конфигурации.

## 10) Рекомендуемые следующие шаги

1. Обновить `README.md` под реальную архитектуру Operator (вместо шаблона Next).  
2. Добавить `docs/architecture.md` с диаграммой потоков данных (Supabase + Poster + API routes + UI).  
3. Добавить `docs/runbook-dev.md` (локальный запуск, порты, lock-файл, стандартные команды).  
4. Добавить smoke-check endpoint checklist для QA/онбординга (минимум `healthz`, `konditerka/orders`, `konditerka/distribution-stats`).
