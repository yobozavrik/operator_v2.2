# Pizza System — Current State (2026-04-03)

Документ фіксує поточний технічний стан пицерійного модуля ERP.
Генерується автоматично під час аудиту.

---

## 1. Архітектура бази даних (схема `pizza1`)

```mermaid
erDiagram
    product_leftovers_map {
        int product_id PK
        int ingredient_id
        bool active
        text product_name
    }

    pizza_oos_logic_flags {
        int spot_id PK
        int storage_id
        bool use_oos_logic
    }

    customer_reservations {
        uuid id PK
        date reservation_date
        text customer_name
        text status
        uuid previous_reservation_id FK
        int version_no
        uuid created_by
        timestamptz created_at
        timestamptz updated_at
        uuid confirmed_by
        timestamptz confirmed_at
    }

    customer_reservation_items {
        uuid id PK
        uuid reservation_id FK
        text sku
        int qty
        jsonb applied_result
        timestamptz created_at
        timestamptz updated_at
    }

    customer_reservations ||--o{ customer_reservation_items : "має"
    customer_reservations ||--o| customer_reservations : "previous_version"
```

### Views

```mermaid
graph TD
    subgraph "pizza1 schema"
        LV[v_pizza_distribution_stats_legacy\nсток + baked_at_factory + avg legacy]
        OV[v_pizza_distribution_stats_oos\nOOS-aware avg_sales_day\ndynamic 14-day window]
        FLAGS[pizza_oos_logic_flags\nuse_oos_logic per spot_id]
        MV[v_pizza_distribution_stats\nMERGE-VIEW\ncompatibility view for filtered callers]
        PROD[v_pizza_production_only\nbaked_at_factory per SKU]
        SUMM[v_pizza_summary_stats\ntotal norm / baked / need]
    end
    subgraph "public schema"
        DIST[v_today_distribution\nкількість до відвантаження per spot]
    end

    LV --> MV
    OV --> MV
    FLAGS --> MV
```

**Merge-view логіка:**
```sql
CASE WHEN f.use_oos_logic = true AND o.avg_sales_day IS NOT NULL
     THEN o.avg_sales_day  -- OOS-aware (14-day rolling, виключає OOS дні)
     ELSE l.avg_sales_day  -- legacy avg
END
```

**OOS формула:**
```
avg_sales_day = sales_14d / available_days_14d
(fallback: / 14 якщо available_days_14d < 7)
```

---

## 2. Flow розподілу (Distribution)

```mermaid
sequenceDiagram
    participant U as UI (DistributionControlPanel)
    participant SR as /api/pizza/sync-stocks
    participant DR as /api/pizza/distribution/run
    participant RR as /api/pizza/distribution/results
    participant P as Poster API
    participant DB as Supabase pizza1

    U->>SR: POST (оновити залишки)
    SR->>P: GET transactions/stocks
    SR->>DB: UPDATE stock_now in leftovers tables

    U->>DR: POST { date }
    DR->>DB: fn_full_recalculate_all(date)
    Note over DB: reads legacy + oos per SKU with bounded parallelism\nрозраховує quantity_to_ship per spot
    DR->>DB: SELECT confirmed reservations for date
    alt є confirmed резерв
        DR->>DB: fn_apply_customer_reservation(reservation_id)
        Note over DB: вираховує з мережевого розподілу\nзаписує applied_result per SKU
        DR->>DB: UPDATE status = 'used_in_distribution'
        DR->>DB: UPDATE older versions = 'superseded'
    end

    U->>RR: GET ?date=
    RR->>DB: SELECT v_today_distribution
    RR->>DB: SELECT customer_reservations WHERE used_in_distribution
    RR-->>U: baseRows + reservationRows
```

---

## 3. Flow резервування (Reservation)

```mermaid
stateDiagram-v2
    [*] --> draft : POST /reservations (нова або update existing)
    draft --> confirmed : POST /reservations/[id]/confirm
    confirmed --> used_in_distribution : distribution/run (автоматично)
    confirmed --> superseded : нова версія підтверджена
    used_in_distribution --> superseded : нова версія запущена

    note right of draft
        Можна редагувати
        Тільки draft може бути змінений
    end note

    note right of confirmed
        Лише 1 confirmed per дата/клієнт
        Старий → superseded при новому confirm
    end note
```

**Версіонування:**
```mermaid
graph LR
    V1[v1 draft] -->|confirm| V1C[v1 confirmed]
    V1C -->|create-version| V2[v2 draft\nprevious_reservation_id=v1]
    V2 -->|edit items| V2e[v2 draft updated]
    V2e -->|confirm| V2C[v2 confirmed]
    V2C -.->|supersedes| V1S[v1 superseded]
    V2C -->|distribution/run| V2U[v2 used_in_distribution]
```

---

## 4. Operational routing per SKU

```mermaid
graph TD
    subgraph "Запит від сервісу"
        Q[fetchPizzaDistributionRowsByProduct\nreconstructs rows from legacy + oos per SKU]
    end

    subgraph "Runtime hot path"
        direction LR
        JOIN[legacy + oos + flags\nbounded parallelism per SKU]
    end

    subgraph "Для кожного рядка (spot)"
        CH{use_oos_logic\n= true?}
        OOS[avg_sales_day з OOS view\n14-day dynamic window]
        LEG[avg_sales_day з legacy view\nісторичний avg]
    end

    Q --> JOIN
    JOIN --> CH
    CH -->|YES| OOS
    CH -->|NO| LEG
```

**Стан флагів (23/23 магазини = 100% охоплення після шагу 4):**

| Група | Магазини | use_oos_logic |
|-------|----------|---------------|
| Всі 23 | Рівненська, Роша, Квартал, Білоруська, Герцена, Гравітон, Ентузіастів, Компас, Проспект, Садова, Шкільна + ін. | true |

---

## 5. API Route Map

```mermaid
graph LR
    subgraph "Pages"
        PP[/pizza/page.tsx]
        PRP[/pizza/production/page.tsx]
        PAP[/pizza/analytics/page.tsx]
    end

    subgraph "API Routes"
        OR[/api/pizza/orders]
        SS[/api/pizza/sync-stocks]
        SUM[/api/pizza/summary]
        SHO[/api/pizza/shop-stats?pizza=]
        DS[/api/pizza/distribution-stats]
        DR[/api/pizza/distribution/run]
        DRR[/api/pizza/distribution/results]
        PD[/api/pizza/production-detail]
        AN[/api/pizza/analytics/dashboard]
        RES[/api/pizza/reservations]
        CON[/api/pizza/reservations/[id]/confirm]
        CV[/api/pizza/reservations/[id]/create-version]
        FIN[/api/pizza/finance/summary]
    end

    PP --> OR
    PP --> SUM
    PRP --> PD
    PAP --> AN

    OR --> DB[(Supabase\npizza1)]
    SS --> DB
    SUM --> DB
    SHO --> DB
    DS --> DB
    DR --> DB
    DRR --> DB
    PD --> DB
    AN --> DB
    RES --> DB
    CON --> DB
    CV --> DB
    FIN --> DB
```

---

## 6. Шар OOS (Out-of-Stock aware avg_sales_day)

```mermaid
graph TD
    W[Вікно: [today-14d, today) в часовому поясі Kyiv]
    TS[Транзакції з Poster за 14 днів]
    IS[Залишки по днях]

    W --> QQ[Запит до v_pizza_distribution_stats_oos]
    TS --> QQ
    IS --> QQ

    QQ --> |available_days ≥ 7| CALC[avg = sales_14d / available_days_14d]
    QQ --> |available_days < 7| FALL[fallback: avg = sales_14d / 14]
    CALC --> MS[min_stock = ceil_avg × коефіцієнт магазину]
    FALL --> MS
```

---

*Дата фіксації: 2026-04-03*
*Джерело: аудит codebase + перевірка DB*
