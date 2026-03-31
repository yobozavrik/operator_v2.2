# Pizza — Повна архітектура системи розподілу

> Зафіксовано: 2026-03-27
> Статус: production live (розподіл + резервування + OOS-aware avg/min_stock у всіх 23 магазинах).

---

## 1. Огляд системи

Система вирішує одну задачу: **щоранку розрахувати скільки піц якого сорту відправити в кожен магазин мережі** з урахуванням:

- поточного залишку на магазині
- середніх продажів за 14 днів
- мінімального stock-норми (`min_stock`)
- резерву замовника (якщо є)

Результат публікується в Excel-файл через `/api/pizza/distribution/results`.

---

## 2. Потік даних: від виробництва до Excel

```
Poster API (виробництво)
        ↓ syncPizzaLiveDataFromPoster()
pizza1.v_pizza_production_only   ←── скільки спечено сьогодні по кожному SKU
        ↓
pizza1.fn_full_recalculate_all(user_id)
  └── для кожного product_id →  pizza1.fn_run_pizza_distribution(product_id, batch_id, date)
            ↓ читає
        pizza1.v_pizza_distribution_stats   ←── avg_sales_day, min_stock, stock_now по магазинам
            ↓ записує
        pizza1.distribution_results         ←── quantity_to_ship per product×spot
                ↓
        public.v_today_distribution         ←── фільтр по сьогоднішній даті (Kyiv)
                ↓
GET /api/pizza/distribution/results
  └── baseRows: network spots
  └── reservationRows: customer (з applied_result)
        ↓
Excel / DistributionControlPanel.tsx
```

---

## 3. Алгоритм розподілу (`fn_run_pizza_distribution`)

Три етапи в порядку пріоритету:

**Етап 1 — Нулі:** магазини з `effective_stock = 0` отримують по 1 шт. першими.

**Етап 2 — Мінімальні залишки:** заповнити до `min_stock`. Якщо не вистачає — пропорційно з пріоритетом по `avg_sales_day DESC`.

**Етап 3 — Надлишки:** якщо ресурс ще залишився — підвищуємо цільову планку `min_stock × v_multiplier` (від 2 до 15) і розподіляємо далі. Непрозподілений залишок записується рядком `'Остаток на Фабрике'`.

Тимчасова таблиця `temp_calc` дропається після кожного виклику.

---

## 4. Ключові views та таблиці (pizza1 schema)

| Об'єкт | Тип | Призначення |
|---|---|---|
| `v_pizza_production_only` | VIEW | Поточний день: product_id, product_name, baked_at_factory |
| `v_pizza_distribution_stats` | VIEW | **Ключова**: avg_sales_day, min_stock, stock_now по кожному product×spot |
| `v_pizza_orders` | VIEW | Сирі продажі останніх 14 днів; є джерелом для `v_pizza_distribution_stats` |
| `distribution_results` | TABLE | Результати поточного дня; очищається при кожному run |
| `distribution_logs` | TABLE | Аудит: started_at, status, batch_id, error_message |
| `customer_reservations` | TABLE | Резерви замовників (статусна машина) |
| `customer_reservation_items` | TABLE | Позиції резервів (sku, qty) |

**public schema (для API):**

| Об'єкт | Тип | Призначення |
|---|---|---|
| `v_today_distribution` | VIEW | distribution_results за kyiv_today — читається results/route.ts |
| `v_pub_analytics` | VIEW | KPI-картки: total_stock, total_need, total_norm — з v_pizza_distribution_stats |
| `v_pub_radar` | VIEW | Ризик-індекс по SKU — з v_pizza_distribution_stats |

---

## 5. Поточна формула `avg_sales_day` (production, незмінена)

Джерело: `pizza1.v_pizza_orders`

```sql
sum(ti.num) / 14.0 AS avg_dynamic
```

- 14 днів фіксований знаменник
- OOS-дні не виключаються
- Результат занижений для SKU з перебоями в постачанні

---

## 6. Система резервування «Відкласти замовнику»

### Статусна машина

```
draft → confirmed → used_in_distribution
                 ↘ superseded  (при новому run з іншою версією)
```

### Сценарії

**Основний сценарій:**
1. `POST /api/pizza/reservations` → status=`draft`
2. `POST /api/pizza/reservations/[id]/confirm` → status=`confirmed`
3. `POST /api/pizza/distribution/run` → `fn_apply_customer_reservation` забирає кількості з мережі → status=`used_in_distribution`, `applied_result` заповнюється

**Версіонування (зміна складу):**
1. `POST /api/pizza/reservations/[id]/create-version` → нова версія з status=`confirmed`, `previous_reservation_id` встановлений
2. `POST /api/pizza/distribution/run` → стара версія стає `superseded`, нова — `used_in_distribution`

**Аннулювання:**
1. Створити нову порожню версію (`items = []`)
2. Підтвердити її
3. Наступний run — `fn_apply_customer_reservation` отримує порожній резерв → замовник не з'являється в Excel

### Як резерв потрапляє в Excel

`results/route.ts` читає `used_in_distribution` резерв за kyiv_today і читає `applied_result.items`:
- `applied_qty > 0` → рядок в Excel: `product_name = sku, spot_name = customer_name, quantity_to_ship = applied_qty`
- Рядки з `applied_qty = 0` відфільтровуються

Базова мережа (`v_today_distribution`) вже відображає розподіл **після** застосування резерву — `fn_apply_customer_reservation` модифікує `distribution_results`.

### Відомий техдолг

- Аннулювання — 3 HTTP-кроки, не атомарно. Ризик: підтвердили порожню версію, але run ще не відбувся — система вважає резерв активним.
- `previous_reservation_id` заповнюється коректно (перевірено в БД).
- Confirmed-резерви за **минулі дати** не очищаються автоматично. `run/route.ts` завжди використовує kyiv_today, тому вони ніколи не застосовуються, але сидять у БД зі статусом `confirmed` назавжди.

---

## 7. OOS-aware min_stock — production live

### Проблема

Поточний знаменник `/14` занижує `avg_sales_day` для SKU з OOS-днями, що призводить до занадто низького `min_stock`.

### Нова формула

```
available_day = (morning_stock > 0) OR (sales > 0)
avg_sales_day = sales_14d / available_days_14d
min_stock = ceil(avg_sales_day * 1.5)
```

Тільки дні з `morning_stock = 0` AND `sales = 0` виключаються зі знаменника.

### ID-mapping

Продажі та залишки використовують різні ідентифікатори. Маппінг задокументований в `pizza-avg-sales-oos-pilot.md` (16 SKU).

### Результати пілоту (2026-03-27, 23 магазини)

- 88 позитивних змін `min_stock` по мережі
- 4 випадки `+2`, решта `+1`
- 10 магазинів: чистий локальний сигнал, немає thin SKU
- 13 магазинів: є SKU з `available_days_14d < 7` → потрібен fallback

Деталі по магазинах: `docs/pizza-avg-sales-oos-pilot.md`
Baseline виробничих значень: `docs/pizza-current-production-snapshot-2026-03-27.csv`

### Артефакти пілоту та rollout

- `supabase/migrations/20260327_pizza_new_logic_pilot.sql` — **ТІЛЬКИ ПІЛОТ**, historical artifact with a fixed test window
- `supabase/migrations/20260328_pizza_oos_distribution_layer.sql` — production migration, applied
- `pizza1.product_leftovers_map` — present in the database

---

## 8. OOS-логіка — архітектура переключення (production state)

### Статус

Migration файл: `supabase/migrations/20260328_pizza_oos_distribution_layer.sql`

Поточний стан:

- migration застосовано
- merge-view live
- hotfix для `Садова` застосовано
- всі `23` магазини включені через `pizza1.pizza_oos_logic_flags`
- `fn_run_pizza_distribution` і `fn_full_recalculate_all` не змінювали сигнатуру

### Блокери на момент фіксації

| # | Блокер | Статус |
|---|--------|--------|
| 1 | Pilot view з hardcoded датами | ✅ Вирішено в _oos view з динамічним вікном |
| 2 | `product_leftovers_map` відсутня в БД | ✅ Migration включає idempotent seed |
| 3 | Feature flag не пов'язаний з алгоритмом | ✅ `pizza_oos_logic_flags` + merge-view |
| 4 | Fallback threshold не визначений | ✅ `available_days_14d < 7` → `sales_14d / 14` |
| 5 | Confirmed-резерви за минулі дати | ⚠️ Низький ризик, cleanup окремо |

### Архітектура (Path A — обрано остаточно)

```
pizza1.v_pizza_distribution_stats          ← merge-view (нова, та сама назва)
  ├── use_oos_logic = false (per spot)  →  pizza1.v_pizza_distribution_stats_legacy
  └── use_oos_logic = true  (per spot)  →  pizza1.v_pizza_distribution_stats_oos
                                              avg/min_stock з OOS-формулою
                                              stock_now/baked_at_factory — від legacy
                                              need_net — перераховується в merge-view

pizza1.pizza_oos_logic_flags               ← таблиця флагів (spot_id PK)
  fields: spot_id, storage_id, use_oos_logic bool, updated_at, updated_by, note
```

`fn_run_pizza_distribution` і `fn_full_recalculate_all` — **без змін сигнатури**.

`v_pizza_distribution_stats_legacy` тепер фіксується як **окрема копія живого
SQL-визначення current view**, а не через rename. Це прибирає ризик для
залежностей і дає змогу безпечно зробити `CREATE OR REPLACE VIEW` для
`pizza1.v_pizza_distribution_stats`.

### Fallback всередині v_pizza_distribution_stats_oos

```sql
CASE
    WHEN available_days_14d >= 7  →  sales_14d / available_days_14d   -- OOS-aware
    ELSE                          →  sales_14d / 14.0                  -- legacy знаменник
END AS avg_sales_day
```

Реалізовано в самій OOS view, не в merge-view. Merge-view тільки вирішує ЗВІДКИ брати.

### Rollback процедура

```sql
DROP VIEW pizza1.v_pizza_distribution_stats;
CREATE OR REPLACE VIEW pizza1.v_pizza_distribution_stats AS
  <definition from pizza1.v_pizza_distribution_stats_legacy>;
DROP VIEW IF EXISTS pizza1.v_pizza_distribution_stats_oos;
DROP VIEW IF EXISTS pizza1.v_pizza_distribution_stats_legacy;
DROP TABLE IF EXISTS pizza1.pizza_oos_logic_flags;
-- product_leftovers_map залишити (діагностика)
```

### Порядок rollout після застосування migration

**Крок 0** — порівняти merge-view проти baseline `pizza-current-production-snapshot-2026-03-27.csv` (всі флаги=false → результати мають збігтися побітово з legacy).

**Група 1 — чистий локальний сигнал, без thin SKU (включати по одному, 7-10 днів спостереження):**
Рівненська → Роша → Квартал → Білоруська → Герцена → Гравітон → Ентузіастів → Компас → Проспект → Садова

**Група 2 — є thin SKU, fallback активний (тільки після підтвердження Групи 1):**
Героїв Майдану, Шкільна, Кварц, Клуб, Бульвар, Київ, Комарова 26 круг, Мікрорайон, Руська, Садгора, Сторожинець, Хотинська, Черемош

**Включення магазину:**
```sql
INSERT INTO pizza1.pizza_oos_logic_flags
    (spot_id, storage_id, use_oos_logic, updated_by, note)
    VALUES (<spot_id>, <storage_id>, true, 'admin', 'Pilot rollout');
```

---

## 9. API маршрути — повний список (pizza domain)

| Маршрут | Метод | Призначення |
|---|---|---|
| `/api/pizza/distribution/run` | POST | Запуск розподілу (sync Poster → recalc → apply reservation) |
| `/api/pizza/distribution/results` | GET | Дані для Excel: мережа + резерв |
| `/api/pizza/production-detail` | GET | Поточне виробництво (live Poster + fallback) |
| `/api/pizza/reservations` | GET/POST | Список резервів / створення |
| `/api/pizza/reservations/[id]/confirm` | POST | Підтвердження резерву |
| `/api/pizza/reservations/[id]/create-version` | POST | Нова версія резерву |
| `/api/pizza/reservations/[id]/mark-used` | POST | **Мертвий код** — статус змінює run, не клієнт |
