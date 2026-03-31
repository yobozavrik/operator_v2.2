# Pizza System — Clean Architecture (2026-03-31)

---

## Шари архітектури

```
┌─────────────────────────────────────────────────────────────────┐
│  FRAMEWORKS & DRIVERS                                           │
│  Next.js App Router · SWR · Framer Motion · Supabase JS SDK     │
├─────────────────────────────────────────────────────────────────┤
│  INTERFACE ADAPTERS                                             │
│  Route handlers · React components · transformers.ts            │
├─────────────────────────────────────────────────────────────────┤
│  USE CASES                                                      │
│  Distribution · Reservation · Analytics · Production            │
├─────────────────────────────────────────────────────────────────┤
│  DOMAIN                                                         │
│  Types · Business rules · Status machine                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Шар 1: Domain (Домен)

### Типи

```typescript
// Рядок дистрибуції (з merge-view)
interface PizzaDistributionRow {
    product_id: number;
    product_name: string;
    spot_name: string;
    avg_sales_day: number;    // OOS-aware або legacy залежно від flags
    min_stock: number;
    stock_now: number;
    baked_at_factory: number;
    need_net: number;         // max(0, min_stock - stock_now)
}

// Резерв клієнта
interface CustomerReservation {
    id: string;
    reservation_date: string;   // YYYY-MM-DD
    customer_name: string;
    status: 'draft' | 'confirmed' | 'used_in_distribution' | 'superseded';
    previous_reservation_id: string | null;
    version_no: number;
    created_by: string | null;
    customer_reservation_items: ReservationItem[];
}

interface ReservationItem {
    id?: string;
    sku: string;
    qty: number;
    applied_result?: AppliedResult;  // тільки після distribution/run
}

interface AppliedResult {
    requested_qty: number;
    applied_qty: number;
    missing_qty: number;
}

// Виробництво
interface ProductionItem {
    product_name: string;
    baked_at_factory: number;
}

// Результат розподілу
interface DistributionResult {
    product_name: string;
    spot_name: string;
    quantity_to_ship: number;
    calc_time: string;
}

// Аналітика
interface AnalyticsDashboard {
    overview: AnalyticsOverview;
    sku: SkuAnalytics[];
    stores: StoreAnalytics[];
    storeSku: StoreSkuAnalytics[];
    planVsFact: PlanVsFactRow[];
    signals: AnalyticsSignal[];
}
```

### Бізнес-правила

1. **OOS-aware avg:** `avg_sales_day = sales_14d / available_days_14d` (min 7 available днів)
2. **min_stock:** розраховується в БД на основі `avg_sales_day × коефіцієнт`
3. **need_net:** `max(0, min_stock - stock_now)` — завжди ≥ 0
4. **total_norm multiplier:** `× 2` (норма мережі = подвійний запас)
5. **Версіонування:** один `confirmed` резерв per (дата, клієнт) одночасно

### Статусна машина резервів

```
draft → confirmed → used_in_distribution
         ↓                    ↓
      superseded ←────────────┘ (при новій версії)
```

---

## Шар 2: Use Cases (Бізнес-логіка)

### UC-1: Розподіл (Distribution)

**Файли:**
- `src/app/api/pizza/distribution/run/route.ts` — orchestrator
- DB: `fn_full_recalculate_all(date)` — алгоритм розподілу
- DB: `fn_apply_customer_reservation(id)` — застосування резерву

**Flow:**
```
1. sync-stocks (опційно, перед запуском)
2. POST /distribution/run { date }
3. fn_full_recalculate_all → quantity_to_ship per spot
4. Знайти confirmed резерв на дату
5. fn_apply_customer_reservation → applied_result per item
6. UPDATE status → used_in_distribution / superseded
7. GET /distribution/results → результат
```

### UC-2: Резервування (Reservation)

**Файли:**
- `src/app/api/pizza/reservations/route.ts` — CRUD
- `src/app/api/pizza/reservations/[id]/confirm/route.ts`
- `src/app/api/pizza/reservations/[id]/create-version/route.ts`
- `src/components/production/DistributionControlPanel.tsx` — UI

**Flow створення:**
```
1. POST /reservations { reservationDate, customerName, items }
2. → INSERT customer_reservations (status=draft)
3. → INSERT customer_reservation_items
4. POST /reservations/[id]/confirm
5. → UPDATE status=confirmed, попередній confirmed → superseded
```

### UC-3: Виробництво (Production)

**Файли:**
- `src/app/api/pizza/orders/route.ts` — черга виробництва
- `src/app/api/pizza/production-detail/route.ts` — деталі по SKU
- `src/app/api/pizza/summary/route.ts` — зведена статистика
- `src/components/production/ProductionTabs.tsx` — UI

### UC-4: Аналітика (Analytics)

**Файли:**
- `src/app/api/pizza/analytics/dashboard/route.ts`
- `src/components/pizza/PizzaProductionAnalytics.tsx`

---

## Шар 3: Interface Adapters

### Route Handlers

| Route | Тип | Джерело |
|-------|-----|---------|
| `/api/pizza/orders` | GET | `v_pizza_distribution_stats` |
| `/api/pizza/sync-stocks` | POST | Poster API → Supabase |
| `/api/pizza/summary` | GET | `fetchPizzaDistributionRowsByProduct` |
| `/api/pizza/shop-stats` | GET | `v_pizza_distribution_stats` (фільтр по product_name) |
| `/api/pizza/distribution-stats` | GET | `fetchPizzaDistributionRowsByProduct` |
| `/api/pizza/distribution/run` | POST | `fn_full_recalculate_all` + `fn_apply_customer_reservation` |
| `/api/pizza/distribution/results` | GET | `v_today_distribution` + `customer_reservations` |
| `/api/pizza/production-detail` | GET | `v_pizza_production_only` |
| `/api/pizza/analytics/dashboard` | GET | `fetchPizzaDistributionRowsByProduct` + `v_pizza_summary_stats` |
| `/api/pizza/reservations` | GET/POST | `customer_reservations` |
| `/api/pizza/finance/summary` | GET | фінансові view |

### Transformers

**Файл:** `src/lib/transformers.ts`

`transformPizzaData(raw[]) → ProductionTask[]`
- Нормалізує числові поля (string → number)
- Групує по product_name
- Обчислює totalStockKg, minStockThresholdKg

### Shared Infrastructure

**Файл:** `src/lib/pizza-distribution-read.ts`

```typescript
// Публічні export-и:
fetchPizzaDistributionRowsByProduct<T>(supabase, selectClause, options?)
fetchActivePizzaProductIds(supabase)
serializeRouteError(error)
PIZZA_ACTIVE_PRODUCT_IDS  // fallback константа
```

---

## Шар 4: Infrastructure

### База даних (Supabase / PostgreSQL)

**Схема `pizza1`:**

| Об'єкт | Тип | Призначення |
|--------|-----|-------------|
| `product_leftovers_map` | TABLE | Маппінг product_id ↔ ingredient_id, прапор active |
| `pizza_oos_logic_flags` | TABLE | Feature flags per магазин (use_oos_logic) |
| `customer_reservations` | TABLE | Резерви клієнтів |
| `customer_reservation_items` | TABLE | SKU рядки резерву + applied_result |
| `v_pizza_distribution_stats_legacy` | VIEW | Frozen legacy avg/min_stock логіка |
| `v_pizza_distribution_stats_oos` | VIEW | OOS-aware dynamic 14-day window |
| `v_pizza_distribution_stats` | VIEW (MERGE) | Роутинг legacy/oos per store via flags |
| `v_pizza_production_only` | VIEW | baked_at_factory per SKU |
| `v_pizza_summary_stats` | VIEW | Зведена статистика |
| `fn_full_recalculate_all` | FUNCTION | Алгоритм розподілу |
| `fn_apply_customer_reservation` | FUNCTION | Застосування резерву до розподілу |

**Схема `public`:**

| Об'єкт | Тип | Призначення |
|--------|-----|-------------|
| `v_today_distribution` | VIEW | Результати поточного розподілу |

### Supabase клієнт

**Файл:** `src/lib/branch-api.ts`

```typescript
createServiceRoleClient()  // bypass RLS, для server-side
```

Всі API routes використовують `service_role` клієнт — RLS не застосовується на рівні запиту. Авторизація через `requireAuth()` перед усіма операціями.

### Poster API

**Файл:** `src/lib/poster2-env.ts` та внутрішні fetchers

Синхронізація: `GET /api/poster/transactions` → `stock_now` update

---

## Шар 5: Frameworks & Drivers

### Next.js App Router

- Pages: `src/app/pizza/page.tsx`, `src/app/pizza/production/page.tsx`, `src/app/pizza/analytics/page.tsx`
- Routes: `src/app/api/pizza/**`
- Layout: `src/components/layout.tsx`

### SWR (data fetching)

| Компонент | Endpoint | Interval |
|-----------|----------|----------|
| `pizza/page.tsx` | `/api/pizza/orders` | 60s |
| `ProductionDetailView` | `/api/pizza/production-detail` | 10s |
| `DistributionControlPanel` | `/api/pizza/distribution/results` | manual |
| `ProductionOrderTable` | `/api/pizza/shop-stats?pizza=` | on demand |

### Framer Motion

- `DistributionControlPanel.tsx` — анімація рядків результатів розподілу
- `transition={{ delay: Math.min(index * 0.03, 0.3) }}` — cap 300ms

---

## Decision Log

| # | Рішення | Причина |
|---|---------|---------|
| 1 | service_role client у всіх routes | Потрібен bypass RLS для крос-схемних запитів |
| 2 | Merge-view `v_pizza_distribution_stats` | Feature-flag routing без зміни бізнес-логіки алгоритму |
| 3 | `pizza_oos_logic_flags` per spot_id | Гнучкий rollout: тонкі SKU магазини потребують OOS fallback |
| 4 | OOS window = 14 днів | Достатньо для виявлення OutOfStock патернів, не надто довго |
| 5 | Fallback avg/14 якщо < 7 available_days | Запобігання завищеним нормам при нових магазинах |
| 6 | Версіонування резервів | Клієнт може передзамовити → розподіл скоригується автоматично |
| 7 | `fetchPizzaDistributionRowsByProduct` — один запит до merge-view | До 2026-03-31: обхід через JS-мерж двох view (legacy+oos). Виправлено: тепер єдиний запит до `v_pizza_distribution_stats` |
| 8 | `fn_apply_customer_reservation` в БД | Атомарність: вираховування + applied_result в одній транзакції |
| 9 | `product_leftovers_map` — service_role only | Таблиця містить ingredient mapping, не потрібна для RLS-рівня |

---

*Версія: 2026-03-31 | Clean Architecture audit*
