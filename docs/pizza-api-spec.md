# Pizza API Specification (2026-03-31)

Всі endpoints вимагають аутентифікації (cookie session або Bearer token).
Базовий URL: `/api/pizza`

---

## Аутентифікація

Всі запити перевіряються через `requireAuth()` у `src/lib/auth-guard.ts`.

- **Cookie auth**: `credentials: 'include'` при fetch
- **Bearer token**: `Authorization: Bearer <token>` заголовок

Відповідь при помилці авторизації: `401 Unauthorized`

---

## Endpoints

### `GET /api/pizza/orders`

Черга виробництва — повний список SKU з мін. залишками та поточними стоками.

**Query params:** немає

**Response `200`:**
```json
[
  {
    "product_id": 292,
    "product_name": "Піца Маргарита",
    "spot_name": "Рівненська",
    "avg_sales_day": 1.5,
    "min_stock": 3,
    "stock_now": 2,
    "baked_at_factory": 50,
    "need_net": 1
  }
]
```

**Кешування:** `refreshInterval: 60000` (SWR)

**Джерело:** `v_pizza_distribution_stats` (merge-view) через `fetchPizzaDistributionRowsByProduct`

---

### `POST /api/pizza/sync-stocks`

Синхронізація залишків із Poster API → Supabase.

**Request body:** немає (або `{}`)

**Response `200`:**
```json
{ "success": true, "synced": 16 }
```

**Response `500`:**
```json
{ "error": "Poster API timeout" }
```

**Side effects:** оновлює `stock_now` у таблицях схеми `pizza1`

---

### `GET /api/pizza/summary`

Зведена статистика: виготовлено / норма / потреба по мережі.

**Query params:** немає

**Response `200`:**
```json
{
  "total_baked": 1240,
  "total_norm": 3680,
  "total_need": 520
}
```

**Кешування:** `Cache-Control: private, max-age=30, stale-while-revalidate=60`

**Логіка:** `total_norm = sum(min_stock) × 2` (коефіцієнт мережі)

---

### `GET /api/pizza/shop-stats`

Розбивка залишків по магазинах для конкретної піци.

**Query params:**
| Параметр | Тип | Обов'язковий | Опис |
|----------|-----|--------------|------|
| `pizza` | string | так | Назва піци (точна відповідність, case-insensitive) |

**Response `200`:**
```json
[
  {
    "product_id": 292,
    "product_name": "Піца Маргарита",
    "spot_name": "Рівненська",
    "stock_now": 4,
    "min_stock": 3,
    "avg_sales_day": 1.5
  }
]
```

**Response `400`:**
```json
{ "error": "Pizza name is required" }
```

---

### `GET /api/pizza/distribution-stats`

Повна таблиця дистрибуції з усіх магазинів.

**Query params:**
| Параметр | Тип | Обов'язковий | Опис |
|----------|-----|--------------|------|
| `product_id` | number | ні | Фільтр по конкретному SKU |

**Response `200`:**
```json
[
  {
    "product_id": 292,
    "product_name": "Піца Маргарита",
    "spot_name": "Рівненська",
    "avg_sales_day": 1.5,
    "min_stock": 3,
    "stock_now": 2,
    "baked_at_factory": 50,
    "need_net": 1
  }
]
```

---

### `POST /api/pizza/distribution/run`

Запустити алгоритм розподілу для вказаної дати.

**Request body:**
```json
{ "date": "2026-03-31" }
```

**Response `200`:**
```json
{
  "success": true,
  "rows_calculated": 368,
  "reservation_applied": true,
  "reservation_id": "uuid-..."
}
```

**Response `400`:**
```json
{ "error": "date is required" }
```

**Алгоритм:**
1. `fn_full_recalculate_all(date)` → розрахунок quantity_to_ship per spot
2. Пошук confirmed резерву на дату
3. `fn_apply_customer_reservation(id)` → коригування + `applied_result`
4. Оновлення статусу: `used_in_distribution`, старі → `superseded`

---

### `GET /api/pizza/distribution/results`

Результати останнього розподілу.

**Query params:**
| Параметр | Тип | Обов'язковий | Опис |
|----------|-----|--------------|------|
| `date` | string `YYYY-MM-DD` | ні | Дата розподілу (default: сьогодні Kyiv TZ) |

**Response `200`:**
```json
{
  "rows": [
    {
      "product_name": "Піца Маргарита",
      "spot_name": "Рівненська",
      "quantity_to_ship": 5,
      "calc_time": "2026-03-31T08:00:00Z"
    }
  ],
  "reservation": {
    "id": "uuid-...",
    "customer_name": "Замовник Галя",
    "items": [
      { "sku": "Піца Маргарита", "applied_qty": 20, "requested_qty": 20, "missing_qty": 0 }
    ]
  }
}
```

**Джерела:**
- `v_today_distribution` (public schema) — мережевий розподіл
- `pizza1.customer_reservations` + `customer_reservation_items.applied_result` — резерв

---

### `GET /api/pizza/production-detail`

Деталі виробництва по SKU (виготовлено за 24 год).

**Query params:** немає

**Response `200`:**
```json
[
  {
    "product_name": "Піца Маргарита",
    "baked_at_factory": 120
  }
]
```

**Джерело:** `v_pizza_production_only` (fallback: `v_pizza_distribution_stats`)

---

### `GET /api/pizza/analytics/dashboard`

Повна аналітика для дашборду.

**Query params:** немає

**Response `200`:**
```json
{
  "overview": {
    "total_baked": 1240,
    "total_norm": 3680,
    "total_need": 520,
    "fill_pct": 67.4
  },
  "sku": [
    {
      "product_id": 292,
      "product_name": "Піца Маргарита",
      "total_baked": 120,
      "total_need": 45,
      "risk_index": 72
    }
  ],
  "stores": [...],
  "store_sku": [...],
  "plan_vs_fact": [...],
  "signals": [...]
}
```

**riskIndex:** `Math.round(avgSales × (needNet / minStock) × 100)`

---

### `GET /api/pizza/reservations`

Список резервів.

**Query params:**
| Параметр | Тип | Обов'язковий | Опис |
|----------|-----|--------------|------|
| `date` | string `YYYY-MM-DD` | ні | Фільтр по даті |

**Response `200`:** масив `CustomerReservation` з вкладеними `customer_reservation_items`

---

### `POST /api/pizza/reservations`

Створити або оновити резерв (draft).

**Request body:**
```json
{
  "id": "uuid-... (optional, для update)",
  "reservationDate": "2026-03-31",
  "customerName": "Замовник Галя",
  "items": [
    { "sku": "Піца Маргарита", "qty": 20 },
    { "sku": "Піца М'ясна", "qty": 15 }
  ]
}
```

**Response `200`:**
```json
{ "success": true, "id": "uuid-..." }
```

**Response `400`:** `reservationDate` або `customerName` відсутні
**Response `403`:** спроба редагувати чужий резерв
**Response `409`:** спроба редагувати не-draft резерв

**Обмеження:** тільки `draft` статус може бути відредагований

---

### `POST /api/pizza/reservations/[id]/confirm`

Підтвердити резерв (draft → confirmed).

**Path params:** `id` — UUID резерву

**Response `200`:**
```json
{ "success": true, "id": "uuid-..." }
```

**Response `409`:** резерв не в статусі `draft`

**Side effects:** попередній `confirmed` резерв на ту ж дату → `superseded`

---

### `POST /api/pizza/reservations/[id]/create-version`

Створити нову версію підтвердженого резерву (для редагування без скасування).

**Path params:** `id` — UUID базового резерву

**Request body:**
```json
{
  "reservationDate": "2026-03-31",
  "customerName": "Замовник Галя",
  "items": [...]
}
```

**Response `200`:**
```json
{ "success": true, "id": "new-uuid-...", "version_no": 2 }
```

**Side effects:**
- Новий резерв: `status=draft`, `previous_reservation_id=<base_id>`, `version_no=N+1`
- Базовий резерв → `superseded`

---

### `GET /api/pizza/finance/summary`

Фінансова зведена статистика.

**Response `200`:** фінансові показники по цеху піци

---

## Статусна машина резервів

```
draft ──confirm──► confirmed ──distribution/run──► used_in_distribution
  ▲                    │                                    │
  │                    └──create-version──► [новий draft]   │
  │                                                         │
  └──────────────────────────── superseded ◄───────────────┘
                                  (при появі нової підтвердженої версії)
```

---

## Коди помилок

| Код | Значення |
|-----|----------|
| 400 | Невалідний запит / відсутні обов'язкові параметри |
| 401 | Не аутентифікований |
| 403 | Заборонено (не власник резерву) |
| 404 | Ресурс не знайдено |
| 409 | Конфлікт стану (наприклад, edit non-draft) |
| 500 | Помилка сервера / БД |

---

*Версія: 2026-03-31 | Аудит + документація*
