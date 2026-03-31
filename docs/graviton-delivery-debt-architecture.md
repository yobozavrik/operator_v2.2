# Graviton — Delivery Debt Layer

Механизм накопления и зачёта долга доставки для цеха Гравитон.

---

## 1. Clean Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  FRAMEWORKS & DRIVERS (Infrastructure)                              │
│                                                                     │
│  • Supabase PostgreSQL  — хранение данных                           │
│  • Poster API           — живые остатки складов                     │
│  • Next.js API Routes   — HTTP layer                                │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│  INTERFACE ADAPTERS                                                 │
│                                                                     │
│  POST /api/graviton/confirm-delivery   — подтвердить доставку       │
│  GET  /api/graviton/confirm-delivery   — текущий долг + pending     │
│  POST /api/graviton/distribution/run   — запуск распределения       │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│  USE CASES (Application Business Rules)                             │
│                                                                     │
│  fn_confirm_delivery(date, delivered_spot_ids)                      │
│    → накапливает долг для непроехавших магазинов                    │
│    → обнуляет долг для доставленных магазинов                       │
│    → меняет статусы: pending → delivered / skipped                  │
│                                                                     │
│  fn_run_distribution_v4(product_id, batch_id, …)                   │
│    → читает долг из delivery_debt                                   │
│    → Stage 2: need = min_stock + debt_kg - (stock + qty)            │
│    → Stage 3: top-up до 4x min_stock                                │
│                                                                     │
│  fn_orchestrate_distribution_live(batch_id, date, shop_ids)         │
│    → оркестрирует запуск по всем продуктам                          │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│  ENTITIES (Enterprise Business Rules)                               │
│                                                                     │
│  delivery_debt          — долг доставки (spot_id, product_id, kg)   │
│  distribution_results   — результаты расчёта (pending/delivered/    │
│                           skipped)                                  │
│  distribution_base      — нормы магазинов (avg_sales, min_stock)    │
│  distribution_input_*   — снимки производства и остатков            │
└─────────────────────────────────────────────────────────────────────┘
```

**Правило зависимостей:** стрелки направлены внутрь. Entities ничего не знают о Use Cases. Use Cases ничего не знают об API Routes или Supabase-специфике.

---

## 2. Mermaid Diagrams

### 2.1 Sequence — полный цикл доставки

```mermaid
sequenceDiagram
    participant L  as Логист
    participant UI as UI / API
    participant OR as fn_orchestrate_distribution_live
    participant V4 as fn_run_distribution_v4
    participant DB as delivery_debt
    participant DR as distribution_results

    Note over L,DR: День 1 — доставка на 3 из 6 магазинов

    L->>UI: POST /distribution/run { shop_ids: [1..6] }
    UI->>OR: fn_orchestrate(batch, date, null)
    OR->>V4: per product (6 магазинов, debt=0)
    V4->>DR: INSERT pending rows (6 магазинов)
    OR-->>UI: { success, total_kg }
    UI-->>L: Распределение готово

    L->>UI: POST /confirm-delivery { delivered: [1,2,3] }
    UI->>DB: UPSERT debt для магазинов [4,5,6]
    UI->>DB: SET debt_kg=0 для магазинов [1,2,3]
    UI->>DR: UPDATE status=delivered (1,2,3)
    UI->>DR: UPDATE status=skipped  (4,5,6)
    UI-->>L: { delivered_spots:3, debt_rows_added:N }

    Note over L,DR: День 2 — доставка на все 6 магазинов

    L->>UI: POST /distribution/run { shop_ids: [1..6] }
    UI->>OR: fn_orchestrate(batch2, date2, null)
    OR->>V4: per product
    V4->>DB: LEFT JOIN delivery_debt
    Note right of V4: debt_kg > 0 для [4,5,6]<br/>Stage 2: need = min_stock + debt_kg - stock
    V4->>DR: INSERT pending rows (6 магазинов, [4,5,6] получают больше)
    OR-->>UI: { success }
    UI-->>L: Распределение с учётом долга

    L->>UI: POST /confirm-delivery { delivered: [1..6] }
    UI->>DB: SET debt_kg=0 для всех 6
    UI->>DR: UPDATE status=delivered (все)
    UI-->>L: Долг закрыт
```

### 2.2 State — жизненный цикл строки distribution_results

```mermaid
stateDiagram-v2
    [*] --> pending : fn_run_distribution_v4\nINSERT

    pending --> delivered : fn_confirm_delivery\nмагазин в delivered_spot_ids
    pending --> skipped   : fn_confirm_delivery\nмагазин НЕ в delivered_spot_ids

    skipped --> [*] : долг записан\nв delivery_debt

    delivered --> [*]

    note right of skipped
        quantity_to_ship добавляется
        в delivery_debt.debt_kg
        (ON CONFLICT DO UPDATE +=)
    end note

    note right of delivered
        delivery_debt.debt_kg
        обнуляется для этого магазина
    end note
```

### 2.3 ER — схема таблиц delivery debt слоя

```mermaid
erDiagram
    DELIVERY_DEBT {
        integer  spot_id      PK
        integer  product_id   PK
        text     product_name
        text     spot_name
        integer  debt_kg
        timestamptz updated_at
    }

    DISTRIBUTION_RESULTS {
        uuid    id              PK
        bigint  product_id
        text    product_name
        text    spot_name
        integer quantity_to_ship
        uuid    calculation_batch_id
        date    business_date
        timestamptz created_at
        text    delivery_status
    }

    DISTRIBUTION_SHOPS {
        integer id         PK
        integer spot_id
        integer storage_id
        boolean is_active
    }

    DISTRIBUTION_BASE {
        integer  код_магазину
        integer  код_продукту
        numeric  avg_sales_day
        integer  min_stock
        text     назва_магазину
    }

    DELIVERY_DEBT }o--|| DISTRIBUTION_SHOPS    : "spot_id"
    DELIVERY_DEBT }o--|| DISTRIBUTION_BASE     : "spot_id = код_магазину"
    DISTRIBUTION_RESULTS }o--|| DISTRIBUTION_SHOPS : "via spot_name"
```

### 2.4 Flowchart — логика Stage 2 с долгом

```mermaid
flowchart TD
    A[Начало Stage 2] --> B{pool > 0?}
    B -- Нет --> Z[Конец Stage 2]
    B -- Да  --> C[Вычислить temp_need\nper shop]

    C --> D["temp_need = MAX(0,\nmin_stock + debt_kg\n- effective_stock - final_qty)"]

    D --> E{SUM temp_need > 0?}
    E -- Нет --> Z

    E -- Да --> F{pool < total_need?}

    F -- Да --> G[Пропорциональное\nраспределение\nk = pool / total_need]
    G --> H[Распределить остаток\nпо приоритету\ndesc temp_need]
    H --> I[pool = 0]
    I --> Z

    F -- Нет --> J[Закрыть все need\nполностью]
    J --> K[pool -= total_need]
    K --> Z

    style D fill:#fef3c7,stroke:#d97706
    style G fill:#dbeafe,stroke:#2563eb
```

---

## 3. Swagger / OpenAPI

```yaml
openapi: 3.0.3
info:
  title: Graviton Delivery Debt API
  version: 1.0.0
  description: |
    Управление долгом доставки для цеха Гравитон.
    Позволяет логисту подтвердить факт доставки и просмотреть накопленный долг.

servers:
  - url: /api/graviton

tags:
  - name: delivery
    description: Подтверждение доставки и управление долгом

paths:
  /confirm-delivery:

    post:
      tags: [delivery]
      summary: Подтвердить доставку
      description: |
        Фиксирует факт физической доставки.
        - Магазины в `delivered_spot_ids` → долг обнуляется, строки → `delivered`
        - Магазины НЕ в списке → их pending суммируется в `delivery_debt`, строки → `skipped`

        Идемпотентен для одной и той же даты — повторный вызов суммирует долг,
        а не дублирует. Пересчёт распределения (`/distribution/run`) не трогает долг.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                business_date:
                  type: string
                  format: date
                  example: "2026-03-28"
                  description: Дата распределения. По умолчанию — сегодня (Kyiv TZ).
                delivered_spot_ids:
                  type: array
                  items:
                    type: integer
                  example: [1, 2, 3]
                  description: |
                    spot_id магазинов, которые физически получили товар.
                    Пустой массив [] означает — никто не получил, всё уходит в долг.
      responses:
        "200":
          description: Доставка подтверждена
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ConfirmDeliveryResponse'
              example:
                success: true
                business_date: "2026-03-28"
                delivered_spots: 3
                delivered_rows: 15
                debt_rows_added: 8
        "500":
          $ref: '#/components/responses/ServerError'

    get:
      tags: [delivery]
      summary: Получить текущий долг и pending распределение
      description: |
        Возвращает текущее состояние долга по всем магазинам и
        pending строки распределения за указанную дату.
        Используется для UI логиста — чекбоксы магазинов с суммами.
      parameters:
        - name: date
          in: query
          required: false
          schema:
            type: string
            format: date
            example: "2026-03-28"
          description: Дата распределения. По умолчанию — сегодня (Kyiv TZ).
      responses:
        "200":
          description: Текущее состояние
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DeliveryStateResponse'
              example:
                success: true
                date: "2026-03-28"
                active_shop_ids: [1, 2, 3, 4, 5, 6]
                pending_distribution:
                  - spot_name: "Білоруська"
                    product_id: 101
                    product_name: "Батон нарізний"
                    quantity_to_ship: 15
                    delivery_status: "pending"
                accumulated_debt:
                  - spot_id: 4
                    spot_name: "Компас"
                    product_id: 101
                    product_name: "Батон нарізний"
                    debt_kg: 5
                    updated_at: "2026-03-27T18:00:00Z"
        "500":
          $ref: '#/components/responses/ServerError'

components:
  schemas:

    ConfirmDeliveryResponse:
      type: object
      properties:
        success:
          type: boolean
        business_date:
          type: string
          format: date
        delivered_spots:
          type: integer
          description: Количество магазинов в delivered_spot_ids
        delivered_rows:
          type: integer
          description: Строк distribution_results помечено как delivered
        debt_rows_added:
          type: integer
          description: Строк добавлено/обновлено в delivery_debt

    DeliveryStateResponse:
      type: object
      properties:
        success:
          type: boolean
        date:
          type: string
          format: date
        active_shop_ids:
          type: array
          items:
            type: integer
        pending_distribution:
          type: array
          items:
            $ref: '#/components/schemas/PendingRow'
        accumulated_debt:
          type: array
          items:
            $ref: '#/components/schemas/DebtRow'

    PendingRow:
      type: object
      properties:
        spot_name:
          type: string
        product_id:
          type: integer
        product_name:
          type: string
        quantity_to_ship:
          type: integer
        delivery_status:
          type: string
          enum: [pending]

    DebtRow:
      type: object
      properties:
        spot_id:
          type: integer
        spot_name:
          type: string
        product_id:
          type: integer
        product_name:
          type: string
        debt_kg:
          type: integer
        updated_at:
          type: string
          format: date-time

    ErrorResponse:
      type: object
      properties:
        success:
          type: boolean
          example: false
        error:
          type: string
          example: "fn_confirm_delivery failed: ..."

  responses:
    ServerError:
      description: Внутренняя ошибка сервера
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'

  securitySchemes:
    supabaseAuth:
      type: http
      scheme: bearer
      description: Supabase JWT token

security:
  - supabaseAuth: []
```

---

## 4. Сценарии использования

### Сценарий A — штатный: частичная доставка

```
1. Утро: запустить /distribution/run (без shop_ids = все 6 магазинов)
2. Логист смотрит план доставки → едем на [1,2,3]
3. После физической доставки: POST /confirm-delivery { delivered_spot_ids: [1,2,3] }
4. Система: debt += plan[4,5,6]
```

### Сценарий B — изменение плана ДО доставки

```
1. Рассчитали на 6 магазинов
2. Пришла инфо: машина только на 5
3. Пересчитать: POST /distribution/run { shop_ids: [1,2,3,4,5] }
   → долг НЕ тронут (пересчёт не трогает delivery_debt)
4. После доставки: POST /confirm-delivery { delivered_spot_ids: [1,2,3,4,5] }
5. Долг магазина 6 продолжает накапливаться
```

### Сценарий C — следующий день, все 6 едут

```
1. POST /distribution/run → fn_run_distribution_v4 читает debt_kg для [4,5,6]
   Stage 2: need = min_stock + debt_kg - live_stock
   → магазины [4,5,6] получают приоритет
2. POST /confirm-delivery { delivered_spot_ids: [1,2,3,4,5,6] }
   → debt_kg = 0 для всех
```

---

## 5. Гарантии безопасности

| Гарантия | Механизм |
|---|---|
| Не ломает текущее распределение | `delivery_debt` пустая → `debt_kg=0` → Stage 2 идентичен оригиналу |
| Идемпотентность confirm | `ON CONFLICT (spot_id, product_id) DO UPDATE` += |
| Пересчёт не трогает долг | `fn_run_distribution_v4` только читает `delivery_debt`, не пишет |
| Отрицательный долг невозможен | `CHECK (debt_kg >= 0)` в схеме таблицы |
| Rollback | Описан в конце migration файла — 3 шага |
