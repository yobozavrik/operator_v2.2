# Система резервування «Відкласти замовнику» — Документація

> Дата аудиту: 2026-03-27
> Статус: Phase 1 (CRUD + підтвердження) + Phase 2 (вплив на алгоритм розподілу) — реалізовано і в продакшні.

---

## 1. Загальна архітектура

### Схема БД (`schema: pizza1`)

**`customer_reservations`** — головна таблиця резерву:

| Колонка | Тип | Призначення |
|---|---|---|
| `id` | uuid PK | Ідентифікатор резерву |
| `reservation_date` | date | Дата, на яку діє резерв |
| `category` | text | Категорія (`'pizza'` за замовчуванням) |
| `customer_name` | text | Ім'я замовника |
| `status` | text | Статус (див. нижче) |
| `version_no` | int | Номер версії (починається з 1) |
| `previous_reservation_id` | uuid FK nullable | Посилання на попередню версію |
| `applied_result` | jsonb | JSON-результат `fn_apply_customer_reservation` |
| `created_by` / `confirmed_by` | text | user.id з auth |
| `created_at` / `confirmed_at` / `updated_at` | timestamptz | Аудит |

**`customer_reservation_items`** — позиції резерву:

| Колонка | Тип | Призначення |
|---|---|---|
| `id` | uuid PK | — |
| `reservation_id` | uuid FK | Посилання на `customer_reservations.id` |
| `sku` | text | Назва продукту (співпадає з `product_name` у виробництві) |
| `qty` | int | Кількість штук |

---

## 2. Статусна машина

```
draft → confirmed → used_in_distribution
                 ↘ superseded  (при появі нової версії після run)
confirmed        ↘ superseded  (застаріла версія, замінена новішою)
used_in_distribution ↘ superseded (попередній run замінений новим)
```

### Переходи та хто їх виконує

| Перехід | Ініціатор |
|---|---|
| `draft` (створення) | `POST /api/pizza/reservations` |
| `draft → confirmed` | `POST /api/pizza/reservations/[id]/confirm` |
| `confirmed → used_in_distribution` | `POST /api/pizza/distribution/run` (автоматично) |
| `confirmed / used_in_distribution → superseded` | `POST /api/pizza/distribution/run` (автоматично) |

---

## 3. API маршрути

### `GET /api/pizza/reservations?date=YYYY-MM-DD`
Повертає всі резерви на задану дату (або всі без фільтру).
Сортування: `reservation_date DESC, version_no DESC, created_at DESC`.
Включає вкладені `customer_reservation_items`.

### `POST /api/pizza/reservations`
Два режими:
- **Без `id` в body** — створення нового резерву зі статусом `draft`, `version_no: 1`.
- **З `id` в body** — редагування існуючого `draft` (дозволено тільки автору).
  Механізм: видаляє всі items → вставляє нові. **Неатомарно** (known limitation).

Валідація:
- `reservationDate` обов'язковий, формат YYYY-MM-DD.
- `customerName` обов'язковий.
- `items` нормалізуються: `qty` → `Math.trunc`, дублікати `sku` об'єднуються.
- `qty <= 0` або порожній `sku` — ігноруються.

### `POST /api/pizza/reservations/[id]/confirm`
Переводить `draft → confirmed`.
Перевірки:
- Статус повинен бути `draft`.
- Тільки автор (`created_by === user.id`).
- Items > 0 **або** є `previous_reservation_id` (дозволяє підтвердити порожній резерв для анулювання).

### `POST /api/pizza/reservations/[id]/create-version`
Створює нову версію поверх існуючого `confirmed` або `used_in_distribution`.
Логіка:
1. Перевіряє що source не `draft`.
2. Якщо вже є `draft` для тієї ж дати+замовника — повертає `{ reused: true, id }`.
3. Інакше: вставляє новий запис з `version_no: source.version_no + 1`, `previous_reservation_id: source.id`, копіює items.

`previous_reservation_id` заповнюється **коректно** — завжди вказує на безпосереднього попередника.

### `POST /api/pizza/distribution/run`
Основний тригер Phase 2. Послідовність:
1. `syncPizzaLiveDataFromPoster` (якщо падає — попередження, продовжуємо).
2. `fn_full_recalculate_all(p_user_id)` — RPC розподілу **без урахування резерву**.
3. Знаходить останній `confirmed` резерв для `businessDate` (`.limit(1)`, сортування по `version_no DESC, created_at DESC`).
4. Якщо знайдено:
   - `fn_apply_customer_reservation(p_business_date, p_reservation_id)` — RPC застосування резерву.
   - Зберігає `applied_result` в резерв.
   - Supersede всі інші версії (`confirmed` + `used_in_distribution`) для тієї ж дати+замовника.
   - Переводить знайдений резерв `confirmed → used_in_distribution`.
5. Якщо не знайдено — supersede будь-який залишковий `used_in_distribution` (щоб не показувати «привид»).

### `POST /api/pizza/reservations/[id]/mark-used`
**Мертвий код.** Не викликається фронтендом. Функціональність поглинута `distribution/run`.

---

## 4. Клієнтська логіка (DistributionControlPanel.tsx)

### Стан форми резерву

```
latestActiveReservation = перший confirmed або used_in_distribution
canEditDraft = draft.id існує  АБО  немає latestActiveReservation
```

| Умова | UI стан |
|---|---|
| `!hasProductOptions` (productionData порожній) | Форма заблокована + попередження |
| `latestActiveReservation` є і `draft.id` = null | Форма захована, показується картка активного резерву |
| `draft.id` є | Форма редагування черновика |

### Flow підтвердження
`handleConfirmReservation`: saveReservation → confirm → refreshReservations.
Два окремих HTTP-запити. Якщо confirm упаде після save — залишається підтверджений-draft, не підтверджений.

### Flow анулювання (3 HTTP-кроки, неатомарно)
```
create-version → saveReservation(пусті items) → confirm
```
Якщо `create-version` повернув `reused: true` — кидає помилку «вже є чернетка».
**Ризик**: якщо другий або третій крок падає — черновик створений але не підтверджений. Наступна спроба анулювання заблокована з повідомленням «вже є чернетка». Виправлення вручну: видалити або підтвердити застряглий draft.

### Відсутність mark-used на фронтенді
Підтверджено: компонент не викликає `/mark-used`. Перехід в `used_in_distribution` відбувається виключно через `distribution/run`. ОК.

---

## 5. Стан БД на 2026-03-27 (аудит)

### 2026-03-27 — норма
| version | status | previous |
|---|---|---|
| v1 | superseded | null |
| v2 | superseded | v1 |
| v3 | superseded | v2 |
| v4 | used_in_distribution | v3 |

Ланцюг версій повний, `previous_reservation_id` заповнені коректно. Run відпрацював — v4 стала `used_in_distribution`, решта `superseded`.

### 2026-03-26 — аномалія
| version | status | previous |
|---|---|---|
| v1 | **confirmed** | null |
| v2 | **confirmed** | v1 |

Два `confirmed` для однієї дати+замовника. `distribution/run` для 2026-03-26 не запускався.
При наступному run: v2 буде обраний (вищий `version_no`), v1 отримає `superseded`. Самостійно не є критичним, але свідчить про відсутність БД-рівня унікальності.

---

## 6. Known Limitations (техдолг Phase 2)

### L1 — Неатомарне анулювання
**Опис**: 3 HTTP-кроки в клієнті. Збій на кроці 2 або 3 залишає порожній draft, який блокує повторне анулювання.
**Обхід**: вручну підтвердити або видалити застряглий draft.
**Рішення**: Server Action або окремий endpoint `POST /reservations/[id]/cancel`.

### L2 — Відсутній DB-рівень унікальності confirmed
**Опис**: немає `UNIQUE` constraint на `(reservation_date, customer_name, status='confirmed')`. Паралельні запити можуть створити два `confirmed`.
**Вплив**: run обирає один (за version_no DESC), другий суперседується. Дані не псуються, але стан брудний.
**Рішення**: partial unique index або перевірка в confirm-route перед UPDATE.

### L3 — businessDate fallback при sync failure
**Опис**: якщо `syncPizzaLiveDataFromPoster` падає, `businessDate` береться як UTC `new Date()`. Може не збігатися з внутрішньою датою Poster, якщо run запускається в нічну зону.
**Вплив**: confirmed reservation може не знайтися (шукаємо по некоректній даті), run пройде без резерву.

### L4 — Неатомарний update items в POST /reservations
**Опис**: при редагуванні draft — спочатку DELETE items, потім INSERT. Якщо INSERT падає — резерв залишається без позицій.
**Вплив**: тільки draft-стан, confirm перевірить кількість items.

### L5 — mark-used endpoint — мертвий код
**Опис**: `POST /api/pizza/reservations/[id]/mark-used` не викликається жодним клієнтом.
**Ризик**: дублювання логіки суперседингу, розбіжність з run-логікою в майбутньому.
**Рішення**: видалити endpoint або зберегти лише як internal utility з документацією.

---

## 7. Потік даних end-to-end

```
Логіст відкриває панель
  └─ GET /api/pizza/reservations?date=TODAY   ← reservationsData
  └─ GET /api/pizza/production-detail          ← productionData (SKU список)
  └─ GET /api/pizza/distribution/results       ← resultsData (поточний розподіл)

Логіст створює резерв:
  POST /reservations          → draft (version 1)
  POST /reservations/[id]/confirm → confirmed

Логіст запускає розподіл:
  POST /distribution/run
    → fn_full_recalculate_all()          (розподіл без резерву)
    → fn_apply_customer_reservation()    (резерв застосовується поверх)
    → confirmed → used_in_distribution
    → старі версії → superseded
    → applied_result зберігається в резерв

Логіст анулює резерв:
  POST /reservations/[id]/create-version  → новий draft (порожній)
  POST /reservations                      → save пустих items
  POST /reservations/[id]/confirm         → підтверджений порожній резерв
  (наступний run побачить confirmed з 0 items → fn_apply пропускається → розподіл без замовника)
```
