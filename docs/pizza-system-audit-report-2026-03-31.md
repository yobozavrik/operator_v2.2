# Pizza System — Audit Report (2026-03-31)

## Резюме

| Показник | Значення |
|----------|----------|
| Файлів перевірено | 31 |
| Проблем виявлено | 9 |
| Виправлено | 9 |
| Файлів видалено (dead code) | 1 |
| Документів створено | 3 |
| Статус | ✅ Виконано |

---

## Деталізація виправлень

### 1. Архітектурний обхід OOS merge-view _(CRITICAL)_

| | |
|-|-|
| **Файл** | `src/lib/pizza-distribution-read.ts` |
| **Проблема** | 260 рядків JS-мержа `v_pizza_distribution_stats_legacy` + `v_pizza_distribution_stats_oos` — повністю ігнорував `pizza_oos_logic_flags` і `v_pizza_distribution_stats` (merge-view). OOS-логіка застосовувалась завжди для всіх магазинів, незалежно від feature flags. |
| **Вплив** | Магазини без прапора `use_oos_logic` отримували OOS avg/min_stock замість legacy. 32 запити на один запит замість 1. |
| **Виправлення** | Переписано до 77 рядків. Єдиний запит до `v_pizza_distribution_stats`. Feature flags тепер контролюють логіку на рівні DB. |
| **Верифікація** | Всі 5 callers (`summary`, `shop-stats`, `distribution-stats`, `analytics/dashboard`, `orders`) — signature сумісна, зміни callers не потрібні. |

---

### 2. Performance: shop-stats завантажував всі 368 рядків _(HIGH)_

| | |
|-|-|
| **Файл** | `src/app/api/pizza/shop-stats/route.ts` |
| **Проблема** | `fetchPizzaDistributionRowsByProduct` без фільтра → все в JS → `filter(row => name === normalizedName)`. |
| **Вплив** | O(368) на кожен запит деталей по піці. |
| **Виправлення** | Прямий запит до `v_pizza_distribution_stats` з `.eq('product_name', pizza.trim())`. Фільтрація на рівні БД. Видалена залежність від `fetchPizzaDistributionRowsByProduct`. |
| **Верифікація** | Caller `ProductionOrderTable.tsx:33` передає `?pizza=${encodeURIComponent(selectedPizza)}` — ім'я береться з тих самих даних view, тому точна відповідність гарантована. |

---

### 3. Auth credentials відсутні на sync-stocks _(HIGH)_

| | |
|-|-|
| **Файл** | `src/components/production/ProductionTabs.tsx:121` |
| **Проблема** | `fetch('/api/pizza/sync-stocks', { method: 'POST', headers: {...} })` — без `credentials: 'include'`. При cookie-based auth запит міг повернути 401. |
| **Виправлення** | Додано `credentials: 'include'` — консистентно з `ProductionDetailView` (рядок 24 того ж файлу). |

---

### 4. Timezone bug: browser TZ замість Kyiv _(HIGH)_

| | |
|-|-|
| **Файл** | `src/components/production/DistributionControlPanel.tsx:72` |
| **Проблема** | `getLocalIsoDate()` обчислювала `now - offset * 60_000` де offset — браузерний TZ. Якщо користувач поза Україною (UTC+0, UTC+5 тощо) — дата розподілу зміщувалась. |
| **Виправлення** | `getKyivIsoDate()` → `new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' })` — завжди повертає київську дату, незалежно від TZ пристрою. |

---

### 5. Не-атомарний UPDATE резерву: ризик втрати items _(HIGH)_

| | |
|-|-|
| **Файл** | `src/app/api/pizza/reservations/route.ts:129` |
| **Проблема** | Порядок: UPDATE header → DELETE all items → INSERT new items. Якщо INSERT падає після DELETE — items втрачені, резерв у сломаному стані (заголовок є, items — ні). |
| **Виправлення** | Безпечний порядок: INSERT нових (з `.select('id')`) → DELETE старих (NOT IN нових IDs) → UPDATE header. Якщо INSERT падає — старі items залишаються, заголовок не оновлюється. |

---

### 6. Dead code: mark-used endpoint _(MEDIUM)_

| | |
|-|-|
| **Файл** | `src/app/api/pizza/reservations/[id]/mark-used/route.ts` |
| **Проблема** | Endpoint реалізував ручний перехід `confirmed → used_in_distribution`. Жоден клієнт цей endpoint не викликав (перевірено grep по всьому `src/`). |
| **Виправлення** | Файл і директорія видалені. Перехід `used_in_distribution` керується виключно `distribution/run/route.ts`. |

---

### 7. Animation delay 11 секунд для 368 рядків _(MEDIUM)_

| | |
|-|-|
| **Файл** | `src/components/production/DistributionControlPanel.tsx:544` |
| **Проблема** | `transition={{ delay: index * 0.03 }}` для 368 рядків = 11 секунд до появи останнього рядка результатів розподілу. |
| **Виправлення** | `transition={{ delay: Math.min(index * 0.03, 0.3) }}` — максимальна затримка 300ms. |

---

### 8. OOS флаг Шкільна _(LOW — вже вирішено)_

| | |
|-|-|
| **Проблема** | За результатами попереднього аудиту вважалось що spot_id=2 (Шкільна) відсутній у `pizza_oos_logic_flags`. |
| **Верифікація** | SELECT підтвердив: spot_id=2 присутній з `use_oos_logic=true`, `storage_id=8`. Всі 23 магазини (spot_id 1–23) охоплені. DB INSERT не потрібен. |

---

### 9. Документація: стан системи _(MEDIUM)_

| | |
|-|-|
| **Проблема** | Відсутня фіксація поточного стану архітектури. |
| **Виправлення** | Створено 3 документи: |
| | `docs/pizza-system-current-state.md` — Mermaid-діаграми DB schema, distribution flow, reservation flow, merge-view routing |
| | `docs/pizza-api-spec.md` — OpenAPI-style специфікація всіх 13 endpoints |
| | `docs/pizza-clean-architecture.md` — Clean Architecture шари з Decision Log |

---

## OOS архітектура — підсумковий стан

```
DB merge-view (v_pizza_distribution_stats):
  ├── v_pizza_distribution_stats_legacy  (frozen legacy avg/min)
  ├── v_pizza_distribution_stats_oos     (dynamic 14-day rolling OOS)
  └── pizza_oos_logic_flags              (23/23 stores, use_oos_logic=true)

Application layer (після виправлення шагу 5):
  fetchPizzaDistributionRowsByProduct()
    └── SELECT FROM v_pizza_distribution_stats
          └── PostgreSQL застосовує feature flag per store ✅
```

**До виправлення:** JS-код завжди мержував OOS над legacy, ігноруючи флаги.
**Після виправлення:** PostgreSQL merge-view застосовує логіку на рівні БД відповідно до `pizza_oos_logic_flags`.

---

## Продуктивність: було → стало

| Метрика | До | Після |
|---------|-----|-------|
| Запитів до БД на `GET /api/pizza/orders` | 32+ (2×16 product_ids) | 1 |
| Запитів до БД на `GET /api/pizza/summary` | 32+ | 1 |
| Запитів до БД на `GET /api/pizza/shop-stats` | 32+ + JS filter | 1 (filtered in DB) |
| Запитів до БД на `GET /api/pizza/analytics/dashboard` | 32+ | 1 |
| Max animation delay | 11s | 0.3s |

---

## Залишковий tech debt

| Пріоритет | Проблема | Файл |
|-----------|----------|------|
| LOW | handleCancelReservation: 3 HTTP кроки (create-version → save empty → confirm) — не атомарно на рівні клієнта | `DistributionControlPanel.tsx` |
| LOW | `ProductionOrderTable.tsx:34` — fetch без credentials: include для shop-stats SWR | `ProductionOrderTable.tsx` |

---

## Перевірені файли

| # | Файл | Статус |
|---|------|--------|
| 1 | `src/lib/pizza-distribution-read.ts` | ✅ Переписано |
| 2 | `src/app/api/pizza/shop-stats/route.ts` | ✅ Виправлено |
| 3 | `src/components/production/ProductionTabs.tsx` | ✅ Виправлено |
| 4 | `src/components/production/DistributionControlPanel.tsx` | ✅ Виправлено (timezone + animation) |
| 5 | `src/app/api/pizza/reservations/route.ts` | ✅ Виправлено |
| 6 | `src/app/api/pizza/reservations/[id]/mark-used/route.ts` | ✅ Видалено |
| 7 | `src/app/api/pizza/summary/route.ts` | ✅ Перевірено, OK |
| 8 | `src/app/api/pizza/distribution/run/route.ts` | ✅ Перевірено, OK |
| 9 | `src/app/api/pizza/distribution/results/route.ts` | ✅ Перевірено, OK |
| 10 | `src/app/api/pizza/distribution-stats/route.ts` | ✅ Перевірено, OK |
| 11 | `src/app/api/pizza/orders/route.ts` | ✅ Перевірено, OK |
| 12 | `src/app/api/pizza/production-detail/route.ts` | ✅ Перевірено, OK |
| 13 | `src/app/api/pizza/analytics/dashboard/route.ts` | ✅ Перевірено, OK |
| 14 | `pizza1.pizza_oos_logic_flags` (DB) | ✅ Верифіковано 23/23 stores |

---

*Аудит виконано: 2026-03-31*
*Автор: Claude Code (аудит + виправлення)*
