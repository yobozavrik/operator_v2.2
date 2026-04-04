# Bulvar Change Log

Назначение: единый журнал всех изменений по `bulvar1` в двух контурах:
- `Supabase` (SQL, views, functions, tables, data migrations)
- `ERP/API` (Next.js routes, libs, UI/transformers, sync orchestration)

Формат записи:
- `Дата/время (Kyiv)`
- `Контур` (`Supabase` | `ERP/API`)
- `Тип` (`audit` | `schema` | `data` | `logic` | `fix` | `rollback-plan`)
- `Действие`
- `Файлы/объекты`
- `Проверка`
- `Риск/примечание`

---

## 2026-04-05 (Kyiv) | Current session

### 16) Bulvar live analytics shell aligned to shared panel system
- Контур: `ERP/API`
- Тип: `fix`
- Действие:
  - `BulvarAnalyticsDashboard` переведён на тот же light-panel shell, что и Florida/Konditerka;
  - live Bulvar presentation now uses shared card borders, metric tiles, and tab patterns.
- Файлы/объекты:
  - `src/components/analytics/BulvarAnalyticsDashboard.tsx`
  - `src/components/production/BulvarProductionTabs.tsx`
  - `src/components/BulvarPowerMatrix.tsx`
  - `src/components/production/BulvarDistributionControlPanel.tsx`
  - `src/components/production/BulvarHistoricalProduction.tsx`
  - `src/components/production/BulvarProductionSimulator.tsx`
- Проверка: `npm.cmd run build` и targeted ESLint pass on the touched Bulvar presentation files.
- Риск/примечание: visual alignment only, owner contract unchanged.

### 17) Bulvar update-stock normalized to edge snapshot contract
- Контур: `ERP/API`
- Тип: `logic`
- Действие:
  - `POST /api/bulvar/update-stock` now refreshes catalog + normalized live stock snapshot + production snapshot;
  - stock sync persists `poster_edge` rows into `bulvar1.effective_stocks`;
  - fallback read-only edge snapshot is used only if the synced snapshot is unavailable;
  - live stock matching prefers `ingredient_id` first and falls back to normalized names only when needed.
- Файлы/объекты:
  - `src/app/api/bulvar/[...path]/route.ts`
  - `src/lib/bulvar-stock-sync.ts`
  - `src/lib/bulvar-catalog.ts`
  - `src/lib/branch-production-sync.ts`
- Проверка: `npm.cmd run build` and targeted ESLint pass.
- Риск/примечание: `effective_stocks` remains the normalized snapshot owner table; UI must not recreate it.

### 18) Bulvar docs synchronized with runtime behavior
- Контур: `ERP/API` + `Supabase`
- Тип: `audit`
- Действие:
  - updated Mermaid architecture to include shared light-panel shell and normalized stock snapshot;
  - updated Clean Architecture to reference `effective_stocks` and the `ingredient_id`-first matching rule;
  - updated Swagger response shape for `POST /api/bulvar/update-stock`.
- Файлы/объекты:
  - `docs/bulvar-clean-architecture.md`
  - `docs/bulvar-architecture-mermaid.md`
  - `docs/bulvar-openapi.yaml`
  - `docs/architecture.md`
- Проверка: doc contract matches current live route shape.
- Риск/примечание: keep docs aligned if `update-stock` response shape changes again.

## 2026-03-19 00:00-23:59 (Kyiv) | Исторические записи (зафиксировано постфактум)

### 1) Аудит единиц товара (Bulvar)
- Контур: `Supabase`
- Тип: `audit`
- Действие: проверен каталог и соответствие `Poster weight_flag` vs локальные unit.
- Файлы/объекты:
  - `bulvar1.production_180d_products`
  - `categories.products`
  - отчет: `tmp/bulvar1_poster_unit_audit.json`
- Проверка: выявлены штучные товары, ошибочно идущие как `kg/кг`.
- Риск/примечание: системная проблема каталога, не единичный кейс.

### 2) Расширение каталога Bulvar под unit из Poster
- Контур: `Supabase`
- Тип: `schema`
- Действие: добавлены поля для unit и признаков источника в каталог Bulvar.
- Файлы/объекты:
  - `supabase/migrations/20260319_bulvar_catalog_units_from_poster.sql`
  - `bulvar1.production_180d_products`
- Проверка: миграция применена.
- Риск/примечание: источник истины по unit перенесен в каталог Bulvar.

### 3) Синк каталога Bulvar из Poster
- Контур: `ERP/API`
- Тип: `logic`
- Действие: добавлен safe-sync каталога и ручной backfill.
- Файлы/объекты:
  - `src/lib/bulvar-catalog.ts`
  - `scripts/sync-bulvar-catalog-live.js`
  - API routes Bulvar (`orders`, `summary`, `production-detail`, `[...path]`, `distribution/run`)
- Проверка: каталог заполняется `unit`/`poster_weight_flag`.
- Риск/примечание: `categories.products.unit` не использовался как truth для Bulvar.

### 4) Перевод SQL на unit из каталога Bulvar
- Контур: `Supabase`
- Тип: `logic`
- Действие: переписаны ключевые view на unit из `bulvar1.production_180d_products`.
- Файлы/объекты:
  - `supabase/migrations/20260319_bulvar_orders_use_catalog_unit.sql`
  - `supabase/migrations/20260319_bulvar_distribution_stats_use_catalog_unit.sql`
  - `bulvar1.v_bulvar_orders`
  - `bulvar1.v_bulvar_distribution_stats_catalog_14d`
- Проверка: контрольные позиции (526/625/806) стали `шт` с корректными метриками.
- Риск/примечание: убрана эвристика и точечные hotfix для unit.

### 5) Удаление временного API-override метрик
- Контур: `ERP/API`
- Тип: `fix`
- Действие: удален пересчет бизнес-метрик в API, оставлено чтение Supabase.
- Файлы/объекты:
  - удален `src/lib/bulvar-metric-overrides.ts`
  - обновлены Bulvar API routes
- Проверка: ссылки на override удалены.
- Риск/примечание: единый источник расчета — Supabase.

### 6) Email-цепочка распределения (Resend)
- Контур: `ERP/API` + `Supabase`
- Тип: `logic`
- Действие:
  - добавлен `scheduled-run` для Bulvar;
  - отправка через Resend;
  - запись статусов в `bulvar1.distribution_jobs` и `bulvar1.distribution_email_log`;
  - `pg_net` callback для email выключен из SQL-планировщика.
- Файлы/объекты:
  - `src/lib/bulvar-distribution-email.ts`
  - `src/app/api/bulvar/distribution/scheduled-run/route.ts`
  - `src/app/api/bulvar/distribution/run/route.ts`
  - `supabase/migrations/20260319_bulvar_distribution_scheduler.sql`
  - `supabase/migrations/20260319_bulvar_scheduler_no_pg_net.sql`
- Проверка: успешная отправка, есть `message_id` и `status=sent` в логе.
- Риск/примечание: для вызова endpoint нужен доступный URL приложения при автоматизации.

---

## 2026-03-20 (Kyiv) | Текущая сессия

### 7) Пилот упаковочного учета через отдельную таблицу
- Контур: `Supabase`
- Тип: `schema`
- Действие: создана отдельная таблица конфигурации упаковки (не в каталоге товара).
- Файлы/объекты:
  - `supabase/migrations/20260320_bulvar_product_packaging_config.sql`
  - `bulvar1.product_packaging_config`
- Проверка: миграция применена.
- Риск/примечание: ручная поддержка правил упаковки допускается бизнесом.

### 8) Подмешивание packaging-конфига в API-карточки
- Контур: `ERP/API`
- Тип: `logic`
- Действие:
  - добавлен helper `bulvar-packaging.ts`;
  - для товаров с активным config:
    - `avg_sales_day` отображается с 1 знаком;
    - `min_stock` считается как `avg * 3`;
    - `need_net = max(0, min_stock - stock_now)`;
    - добавлены `*_packs_est`.
- Файлы/объекты:
  - `src/lib/bulvar-packaging.ts`
  - `src/app/api/bulvar/orders/route.ts`
  - `src/app/api/bulvar/[...path]/route.ts`
  - `src/app/api/bulvar/production-detail/route.ts`
- Проверка: для `product_id=612` карточки показывают упаковочные поля.
- Риск/примечание: пока смешанный режим, не весь SQL еще унифицирован.

### 9) Исправление фактических остатков в карточке
- Контур: `ERP/API`
- Тип: `fix`
- Действие: включен exact stock override из `bulvar1.effective_stocks` для упаковочных товаров.
- Файлы/объекты:
  - `src/lib/bulvar-packaging.ts`
- Проверка: `Факт` в карточке магазина показывается дробно (например `0.39`, `1.13`, `3.13`).
- Риск/примечание: маппинг `spot -> storage` чувствителен к качеству имен.

### 10) Локальная адаптация распределения под упаковочные весовые товары
- Контур: `ERP/API`
- Тип: `logic`
- Действие:
  - `distribution/run` переведен в mixed-mode:
    - обычные товары: прежняя integer-логика;
    - товары с active packaging config и `unit=kg`: распределение в `kg` (quantum `0.01`), stage-1 topup от `pack_weight_calc_kg`.
  - в `scheduled-run` убрано принудительное округление `quantity_to_ship` до int.
- Файлы/объекты:
  - `src/app/api/bulvar/distribution/run/route.ts`
  - `src/app/api/bulvar/distribution/scheduled-run/route.ts`
- Проверка: требуется бизнес-проверка на живом прогоне.
- Риск/примечание: SQL-view по `min_stock` пока исторически содержит формулу `*1.5` и integer; нужна полная унификация.

### 11) Step 1 (подготовка): `v_bulvar_orders` -> `min_stock = avg_sales_day * 3`
- Контур: `Supabase`
- Тип: `logic`
- Действие:
  - подготовлена отдельная миграция шага 1;
  - формула `min_stock` переведена с `*1.5` на `*3`;
  - после первой попытки скорректировано:
    - `min_stock` оставлен типом `integer` для совместимости зависимых объектов;
    - дробный `kg min_stock` переносится на следующий шаг (distribution stats слой).
- Файлы/объекты:
  - `supabase/migrations/20260320_bulvar_orders_min_stock_x3.sql`
  - `bulvar1.v_bulvar_orders`
- Проверка: первая попытка применения дала `42P16` (нельзя сменить тип колонки view `min_stock` с integer на numeric). Миграция скорректирована под integer-тип.
- Риск/примечание: пока это только шаг 1; `v_bulvar_distribution_stats_catalog_14d` еще не переведен и может давать старые значения.

### 12) Step 2 (подготовка): `v_bulvar_distribution_stats_catalog_14d` -> `min_stock = avg_sales_day * 3`
- Контур: `Supabase`
- Тип: `logic`
- Действие:
  - первая версия миграции со `DROP VIEW bulvar1.v_bulvar_distribution_stats` не применима из-за зависимостей
    (`v_bulvar_today_distribution`, `v_bulvar_summary_stats`, `v_bulvar_analytics_kpi`, `v_bulvar_analytics_top5`);
  - шаг 2 переведен в safe shadow-режим:
    - создаются параллельные views:
      - `bulvar1.v_bulvar_distribution_stats_catalog_14d_x3`
      - `bulvar1.v_bulvar_distribution_stats_x3`
    - основной контур не трогается до подтверждения математики.
  - в shadow-views:
    - единая формула `min_stock = avg_sales_day * 3`;
    - `kg`: дробный `min_stock`/`need_net` (round 3);
    - `шт`: `CEIL(...*3)` для `min_stock`.
- Файлы/объекты:
  - `supabase/migrations/20260320_bulvar_distribution_stats_x3_shadow.sql`
  - `bulvar1.v_bulvar_distribution_stats_catalog_14d_x3`
  - `bulvar1.v_bulvar_distribution_stats_x3`
- Проверка: ожидает применение и live-валидацию.
- Риск/примечание: переключение основного контура выполняется только после проверки shadow-views.

### 13) Step 2 (валидация shadow-views): успешно
- Контур: `Supabase`
- Тип: `audit`
- Действие:
  - проверены `pg_get_viewdef('bulvar1.v_bulvar_distribution_stats_x3')`;
  - проверена выборка по контрольным товарам `612`, `526`, `625`.
- Результат:
  - `kg` товар (`612`) дает дробные `min_stock`/`need_net` по формуле `avg_sales_day * 3`;
  - `шт` товары (`526`, `625`) сохраняют integer-поведение через `CEIL`.
- Риск/примечание:
  - основной контур `v_bulvar_distribution_stats` пока не переключен;
  - для UI/операций нужен следующий шаг — безопасное переключение API на `*_x3`.

### 14) Step 3: API switch -> `v_bulvar_distribution_stats_x3`
- Контур: `ERP/API`
- Тип: `logic`
- Действие:
  - Bulvar API переведен на чтение из shadow-view `v_bulvar_distribution_stats_x3`;
  - основной SQL-контур (`v_bulvar_distribution_stats`) пока не тронут.
- Файлы/объекты:
  - `src/lib/branch-api.ts` (bulvar `distributionView`)
  - `src/app/api/bulvar/orders/route.ts`
  - `src/app/api/bulvar/production-detail/route.ts`
  - `src/app/api/bulvar/distribution/run/route.ts`
  - `src/app/api/bulvar/distribution/scheduled-run/route.ts`
- Проверка: ожидает live-проверку UI/распределения на `612` + контрольный `шт` товар.
- Риск/примечание:
  - аналитические SQL-view в схеме пока остаются на старом базовом view;
  - это осознанный временный split до финального SQL-switch.

### 15) XLSX intake: список товаров для packaging-config (подготовка SQL, без применения)
- Контур: `ERP/API` + `Supabase`
- Тип: `audit`
- Действие:
  - считан файл `C:\Users\dmytr\Downloads\Telegram Desktop\БУЛЬВАР.xlsx` (лист `Розподіл`);
  - выделены уникальные товары из колонки `ТОВАР`;
  - выполнен live-match с `categories.products` и `bulvar1.production_180d_products`;
  - подготовлен SQL upsert в `bulvar1.product_packaging_config` (без применения).
- Артефакты:
  - `tmp/bulvar_packaging_source.xlsx` (копия файла с ASCII-именем)
  - `tmp/bulvar_packaging_products_from_xlsx.json`
  - `tmp/bulvar_packaging_upsert_from_xlsx.sql`
- Проверка:
  - `unique_products_in_xlsx = 9`
  - `matched_products = 8`
  - `missing = 1` (`ТОВАР` как заголовочный артефакт)
- Риск/примечание:
  - автогенерация использует текущие unit/flags из базы; перед применением SQL требуется ручное подтверждение списка.

### 16) XLSX intake: SQL upsert применен (подтверждено)
- Контур: `Supabase`
- Тип: `data`
- Действие:
  - выполнен `tmp/bulvar_packaging_upsert_from_xlsx.sql`;
  - данные записаны в `bulvar1.product_packaging_config`.
- Проверка:
  - активных записей после upsert: `8`
  - `product_id`: `505, 509, 526, 538, 585, 612, 621, 862`
  - параметры у всех:
    - `pack_weight_min_kg = 0.400`
    - `pack_weight_max_kg = 0.500`
    - `pack_weight_calc_kg = 0.400`
    - `pack_zero_threshold_kg = 0.100`
    - `packs_rounding_mode = ceil`
- Риск/примечание:
  - часть записей имеет `unit='шт'` в рабочем контуре; если упаковочная логика нужна только для весовых, такие записи надо деактивировать/очистить отдельным шагом.

### 17) XLSX re-ingest correction (2026-03-20): пересбор из актуального `БУЛЬВАР.xlsx`
- Контур: `ERP/API` + `Supabase`
- Тип: `fix`
- Причина:
  - при первом импорте был взят неактуальный файл/неверная колонка (`ТОВАР` читался не из `A:Назва`);
  - это дало заниженный список.
- Действие:
  - выполнен повторный intake из `C:\Users\dmytr\Downloads\Telegram Desktop\БУЛЬВАР.xlsx` (актуальный, `12079`, `2026-03-20 15:42:50`);
  - товары считаны из колонки `Назва` (лист `export_dishes_title`);
  - отфильтрованы весовые позиции (`кг`) по unit файла;
  - выполнен live-match с `bulvar1.production_180d_products`.
- Результат:
  - `kg_items_in_xlsx = 16`
  - `matched = 16`
  - `missing = 0`
  - `matched_ids = 619,204,612,611,1042,668,796,585,531,512,515,604,569,505,566,235`
- Артефакты:
  - `tmp/bulvar_packaging_source_latest.xlsx`
  - `tmp/bulvar_packaging_products_from_xlsx_v2.json`
  - `tmp/bulvar_packaging_upsert_from_xlsx_v2.sql`

---

## Open Issues (не закрыто)

1. Bulvar SQL-база (`v_bulvar_orders`, `v_bulvar_distribution_stats_catalog_14d`) местами использует `*1.5` и integer, что конфликтует с целевой формулой `*3`.
2. Есть смешанный режим: часть путей считает по новым правилам в API, часть все еще читает старый SQL-расчет.
3. Для полной консистентности нужен единый пересчет `min_stock = avg_sales_day * 3` для всех товаров Bulvar на уровне Supabase-слоя.

### 18) XLSX re-ingest hard fix (2026-03-20): full valid-row upsert regenerated
- Context: ERP/API + Supabase`n- Type: ix`n- Action:
  - built deterministic parser script 	mp/generate-bulvar-packaging-upsert.js`n  - source file: C:\Users\dmytr\Downloads\Telegram Desktop\�������.xlsx`n  - filter rule: include only rows with (name + numeric min/max + unit in ��/��)`n  - generated final artifacts:
    - 	mp/bulvar_packaging_rows_from_xlsx_final.json`n    - 	mp/bulvar_packaging_upsert_from_xlsx_final.sql`n- Result:
  - parsed valid rows from xlsx: 32`n  - service/header rows excluded from SQL generation`n

### 19) Packaging connected to Bulvar distribution results UI (2026-03-20)
- Context: ERP/API`n- Type: logic`n- Action:
  - updated API src/app/api/bulvar/distribution/results/route.ts to enrich today distribution rows with:
    - unit`n    - current_stock / min_stock / vg_sales from _bulvar_distribution_stats_x3`n    - packaging estimates via ulvar1.product_packaging_config (quantity_to_ship_packs_est, etc.)
    - exact kg stock via effective_stocks mapping (through etchBulvarExactStocks)
  - updated UI src/components/production/BulvarDistributionControlPanel.tsx:
    - unit-aware formatting (�� -> decimals, �� -> integer)
    - display estimated packs near shipment quantity for weight products only
  - hardened src/app/api/bulvar/production-detail/route.ts:
    - packaging flags/pack estimates now enabled only for kg products
    - replaced catch (err: any) with safe unknown handling
- Validation:
  - eslint passed for changed files


### 20) Excel export: added packaging column for Bulvar distribution (2026-03-20)
- Context: ERP/UI`n- Type: logic`n- Action:
  - updated src/lib/order-export.ts (generateDistributionExcel)
  - added new export column: ����.`n  - column value source: quantity_to_ship_packs_est when packaging_enabled=true`n  - for non-packaging or warehouse rows: -`n- Validation:
  - eslint passed for src/lib/order-export.ts`n

### 21) Fix stale ACT stock in Bulvar cards (2026-03-20)
- Context: ERP/API`n- Type: ix`n- Root cause:
  - /api/bulvar/orders did not run live stock sync before reading cards
  - exact stock overlay was loaded only for products existing in packaging config, not for all displayed products
- Action:
  - updated src/app/api/bulvar/orders/route.ts`n    - added syncBulvarStocksFromEdge(supabase) before data read
    - changed exact-stock load to all displayed product_ids (
ormalizedRows)
    - hardened error handling in catch block (unknown)
- Validation:
  - eslint passed for orders/route.ts`n

### 22) Product card ACT display fix (2026-03-20)
- Context: ERP/UI`n- Type: ix`n- Action:
  - updated src/components/BulvarPowerMatrix.tsx`n    - fixed kg-unit detection (��/kg) in product cards
    - hardened ACT/MIN/TGT formatters with finite-number guard
  - updated src/lib/transformers.ts`n    - switched stock/min/need source resolution from || to ?? in 	ransformPizzaData to avoid dropping explicit zero values and wrong fallbacks
- Expected impact:
  - product card ACT should show factual totals on green cards consistently


### 23) Permission hotfix for Bulvar distribution stats view (2026-03-20)
- Context: ERP/API`n- Type: hotfix`n- Root cause:
  - DB role used by API had no SELECT privilege on ulvar1.v_bulvar_distribution_stats_x3`n- Action:
  - switched Bulvar API endpoints from direct _bulvar_distribution_stats_x3 to _bulvar_distribution_stats (granted view):
    - src/app/api/bulvar/orders/route.ts`n    - src/app/api/bulvar/production-detail/route.ts`n    - src/app/api/bulvar/distribution/results/route.ts`n    - src/app/api/bulvar/distribution/run/route.ts`n    - src/app/api/bulvar/distribution/scheduled-run/route.ts`n- Validation:
  - eslint: no errors (warnings only)


### 24) Distribution run failure hardening (2026-03-20)
- Context: ERP/API/UI`n- Type: hotfix`n- Root cause:
  - /api/bulvar/distribution/run could fail on permission denied for one specific stats view
  - frontend displayed only generic text without detailed DB cause
- Action:
  - updated src/app/api/bulvar/distribution/run/route.ts`n    - added fallback stats view chain per product:
      1) _bulvar_distribution_stats`n      2) _bulvar_distribution_stats_catalog_14d_x3`n      3) _bulvar_distribution_stats_catalog_14d`n    - if all fail, returns aggregated error messages with view names
  - updated src/components/production/BulvarDistributionControlPanel.tsx`n    - run button now surfaces error + message + code in one line
- Validation:
  - eslint passed (warnings only)

### 25) Fix run failure: quantity_to_ship integer -> numeric for Bulvar distribution (2026-03-20)
- Context: `Supabase`
- Type: `schema fix`
- Root cause:
  - `/api/bulvar/distribution/run` inserts decimal kg values (e.g. `0.322`)
  - DB column `bulvar1.distribution_results.quantity_to_ship` is integer-like in current DB, causing: `invalid input syntax for type integer: "0.322"`
- Action:
  - added migration `supabase/migrations/20260320_bulvar_distribution_results_qty_numeric.sql`
  - migration safely converts `quantity_to_ship` to `numeric(12,3)` only when current type is `smallint/integer/bigint`
- Expected impact:
  - distribution run accepts fractional kg shipments and no longer fails on decimal inserts
### 26) Bulvar card grid visual alignment polish (2026-03-20)
- Context: `ERP/UI`
- Type: `ui`
- Action:
  - updated `src/components/BulvarPowerMatrix.tsx`
  - centered card grids with max-width container (`mx-auto`, `max-w-[1700px]`)
  - unified product card vertical rhythm:
    - fixed card min height (`min-h-[170px]`)
    - fixed title zone height (`min-h-[42px]`)
    - aligned ACT/TGT row (`min-h-[50px]`, `items-end`)
  - improved numeric visual consistency with `tabular-nums` for ACT/TGT/MIN values
  - tightened title line-height for cleaner multi-line heading alignment
- Expected impact:
  - cards render on consistent levels; grid appears centered and cleaner

### 27) Bulvar scheduled-run aligned to x3 (2026-04-03)
- Context: ERP/API
- Type: logic
- Action:
  - updated `src/app/api/bulvar/distribution/scheduled-run/route.ts` to read `v_bulvar_distribution_stats_x3`
  - scheduler email rows now use the same owner view as orders and summary
- Validation:
  - runtime read path matches the owner-layer distribution stats view

### 28) Bulvar docs matrix refresh (2026-04-03)
- Context: docs
- Type: audit
- Action:
  - updated `docs/architecture-mermaid.md` Bulvar view reference to `v_bulvar_distribution_stats_x3`
  - added Bulvar API rows to `docs/supabase-client-matrix.md`
  - refreshed a stale Bulvar form comment to reference the x3 owner view
- Validation:
  - docs now match the current Bulvar runtime model

### 29) Bulvar docs contract refresh (2026-04-03)
- Context: docs
- Type: audit
- Action:
  - updated `docs/bulvar-openapi.yaml` with `calculate-distribution`, `production-180d`, and `scheduled-run`
  - updated `docs/bulvar-clean-architecture.md` to list the full Bulvar endpoint surface
- Validation:
  - docs now cover the current Bulvar runtime contract

### 30) Bulvar UI shell standardization (2026-04-05)
- Context: ERP/UI
- Type: fix
- Action:
  - standardized Bulvar production pages to the same light-card shell used by Florida and Konditerka;
  - aligned `BulvarProductionTabs`, `BulvarPowerMatrix`, and `BulvarProductionOrderTable` to shared dashboard tokens and card patterns;
  - kept business logic in the owner layer while changing only the presentation shell.
- Files/objects:
  - `src/components/production/BulvarProductionTabs.tsx`
  - `src/components/production/BulvarProductionOrderTable.tsx`
  - `src/components/BulvarPowerMatrix.tsx`
- Validation:
  - `npm.cmd run build`
- Risk/notes:
  - visual standardization only; no change to owner calculations or API payloads.

### 31) Bulvar docs synchronization (2026-04-05)
- Context: docs
- Type: audit
- Action:
  - added Bulvar docs links to the project README;
  - added a dedicated Bulvar section to `docs/architecture.md`;
  - extended `docs/bulvar-clean-architecture.md` with presentation-shell guidance and a fuller endpoint map;
  - added a Bulvar presentation flow diagram to `docs/bulvar-architecture-mermaid.md`.
- Files/objects:
  - `README.md`
  - `docs/architecture.md`
  - `docs/bulvar-clean-architecture.md`
  - `docs/bulvar-architecture-mermaid.md`
- Validation:
  - documentation points to the same current Bulvar owner model as the runtime code.

### 32) Bulvar Swagger contract alignment (2026-04-05)
- Context: docs
- Type: audit
- Action:
  - updated `docs/bulvar-openapi.yaml` descriptions to match the live Bulvar API behavior;
  - documented `unit` as a required field in `BulvarOrderRow`;
  - kept the contract aligned with the x3 owner view and the current update-stock ingestion boundary.
- Files/objects:
  - `docs/bulvar-openapi.yaml`
- Validation:
  - API contract now reflects the current owner-backed payload shape.

