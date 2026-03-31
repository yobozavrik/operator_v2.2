# Pizza average sales recalculation pilot and rollout

This document records the pilot and production rollout for recalculating pizza
`avg_sales_day` and `min_stock` with OOS-aware availability logic.

It reflects the corrected comparison method:

- the legacy production logic is evaluated on the same rolling 14-day window
  used by `pizza1.v_pizza_orders`
- the pilot compares the new denominator against that same legacy window
- older pilot numbers that were based on the fixed window `2026-03-14` to
  `2026-03-28` are superseded and must not be used

The historical pilot results remain important because they justified the
rollout. The production rollout described below is already live across the full
23-store network.

## Goal

The current pizza logic divides sales from the last 14 days by 14 calendar
days. That works only when a SKU is available every day. When a pizza is out of
stock, the denominator stays at 14, the average is artificially depressed, and
`min_stock` can be set too low.

The pilot tests a replacement denominator that counts only days when the SKU is
actually available for sale.

## Business rule

The team agreed to keep the current 14-day horizon and change only the
denominator.

For each `store x pizza` pair, the pilot uses:

- `available_day = (morning_stock > 0) OR (sales > 0)`
- `avg_sales_day = sales_14d / available_days_14d`
- `min_stock = ceil(avg_sales_day * 1.5)`

Only days with both `morning_stock = 0` and `sales = 0` are excluded from the
denominator.

## Legacy production rule

The current production source is:

- `pizza1.v_pizza_distribution_stats`

That view does not compute `avg_sales_day` itself. It reads it from:

- `pizza1.v_pizza_orders`

The current legacy formula inside `pizza1.v_pizza_orders` is:

- `sum(ti.num) / 14.0 AS avg_dynamic`

So the current production rule is:

- sales over the last 14 days
- divided strictly by 14
- no stock and OOS logic in the denominator

## Dynamic calculation window

The production and pilot comparison logic must use the same dynamic Kyiv-based
window.

The date anchor is:

- `kyiv_today = (now() at time zone 'Europe/Kyiv')::date`

Sales must be read from:

- `date_close >= kyiv_today - interval '14 days'`
- `date_close < kyiv_today`

Leftovers must be read from:

- `snapshot_date >= kyiv_today - interval '14 days'`
- `snapshot_date < kyiv_today`

That means the system always uses the last 14 full days before the current Kyiv
date.

For the recalculation batch documented in this file, that dynamic rule resolved
to:

- `kyiv_today = 2026-03-27`
- `window_start = 2026-03-13`
- `window_end = 2026-03-27`

## ID mapping between sales and leftovers

Pizza sales and leftovers do not share the same identifiers.

For example:

- sales: `Піца "Гавайська"` uses `product_id = 292`
- leftovers: `Піца "Гавайська"` uses `ingredient_id = 391`

The pilot therefore uses an explicit mapping layer for the 16 pizza SKUs.

| product_id | ingredient_id | pizza |
|---|---:|---|
| 292 | 391 | `Піца "Гавайська"` |
| 294 | 392 | `Піца "Грибна"` |
| 295 | 397 | `Піца "Європейська"` |
| 297 | 393 | `Піца "М*ясна"` |
| 298 | 394 | `Піца "Мисливська"` |
| 300 | 396 | `Піца "Особлива"` |
| 301 | 395 | `Піца "Сирна"` |
| 573 | 901 | `Піца "Кватро Формаджі"` |
| 658 | 1412 | `Піца "Ді Шпіначіо"` |
| 659 | 1411 | `Піца "Поло"` |
| 660 | 1413 | `Піца "Італійська"` |
| 879 | 1954 | `Піца "Верона"` |
| 1054 | 2214 | `Піца "Пепероні"` |
| 1055 | 2215 | `Піца "Американська"` |
| 1098 | 2274 | `Піца "Козацька"` |
| 1099 | 2275 | `Піца "Тонно" (з тунцем і шпинатом)` |

## What was prepared

The pilot produced these artifacts:

- `supabase/migrations/20260327_pizza_new_logic_pilot.sql`
- `tmp/pizza_rivnenska_compare.sql`
- `tmp/pizza_rivnenska_readonly_pilot.sql`
- `tmp/run_pizza_new_logic_pilot.js`
- `tmp/pizza-pilot-recalc/*.json`
- `docs/pizza-current-production-snapshot-2026-03-27.csv`

At the time of the pilot, the migration prepared an additive rollout path and
had not yet been applied in production.

The Node pilot script is the working read-only tool for validating stores
against live data.

The CSV snapshot is the fixed pre-rollout baseline of the current production
values for all `23 x 16 = 368` `store x pizza` pairs. It records the production
`avg_sales_day` and `min_stock` before any OOS rollout.

## What actually ran

The work happened in two phases.

Phase 1 was a read-only pilot:

1. Read the current production rows from `pizza1.v_pizza_distribution_stats`.
2. Read raw sales from `categories.transactions` and
   `categories.transaction_items`.
3. Read raw leftovers from `leftovers.daily_snapshots`.
4. Recalculate the new metrics locally in the pilot script.
5. Compare the pilot result to the current production result.

Phase 2 was the live production rollout:

1. Apply `supabase/migrations/20260328_pizza_oos_distribution_layer.sql`.
2. Verify that the merge-view equals legacy when all flags are off.
3. Fix the owner-layer duplicate-store bug for `Садова` in the OOS view.
4. Enable stores one by one through `pizza1.pizza_oos_logic_flags`.
5. Run the standard pizza distribution after each store enablement.
6. Validate live `avg_sales_day`, `min_stock`, `stock_now`, and `need_net`.

The rollout finished successfully for all 23 stores without changing the
three-stage distribution function contract.

## Stores already validated

The corrected legacy-window pilot is now documented for the full store set:

- `Рівненська`
- `Роша`
- `Квартал`
- `Шкільна`
- `Кварц`
- `Клуб`
- `Бульвар`
- `Білоруська`
- `Герцена`
- `Героїв Майдану`
- `Гравітон`
- `Ентузіастів`
- `Київ`
- `Комарова 26 круг`
- `Компас`
- `Мікрорайон`
- `Проспект`
- `Руська`
- `Садгора`
- `Садова`
- `Сторожинець`
- `Хотинська`
- `Черемош`

## Per-store results

Each store below is summarized by:

- identifiers
- SKUs whose `min_stock` changes under the new logic
- weak local-signal SKUs where `available_days_14d < 7`

### Rivnenska

Store identifiers:

- `spot_id = 14`
- `storage_id = 36`

Changed `min_stock`:

- `Піца "Американська"`: `1 -> 2`
- `Піца "Гавайська"`: `1 -> 2`
- `Піца "М*ясна"`: `1 -> 2`

Weak local signals:

- none

Interpretation:

`Рівненська` remains a clean pilot store. The local signal is strong, and the
new denominator changes only three underestimated SKUs.

### Rosha

Store identifiers:

- `spot_id = 23`
- `storage_id = 55`

Changed `min_stock`:

- `Піца "Гавайська"`: `3 -> 4`
- `Піца "Грибна"`: `1 -> 2`
- `Піца "Європейська"`: `2 -> 3`
- `Піца "Кватро Формаджі"`: `5 -> 6`

Weak local signals:

- none

Interpretation:

`Роша` has a stronger positive OOS correction than first expected once the
comparison is aligned to the same legacy window.

### Kvartal

Store identifiers:

- `spot_id = 22`
- `storage_id = 47`

Changed `min_stock`:

- `Піца "Гавайська"`: `1 -> 2`
- `Піца "Італійська"`: `1 -> 2`
- `Піца "Козацька"`: `1 -> 2`

Weak local signals:

- none

Interpretation:

`Квартал` stays stable. The new denominator produces moderate, believable
changes without thin-data concerns.

### Shkilna

Store identifiers:

- `spot_id = 2`
- `storage_id = 8`

Changed `min_stock`:

- `Піца "Гавайська"`: `3 -> 4`
- `Піца "Козацька"`: `1 -> 2`
- `Піца "Особлива"`: `1 -> 2`
- `Піца "Поло"`: `1 -> 2`

Weak local signals:

- `Піца "Поло"`: `available_days_14d = 6`

Interpretation:

`Шкільна` remains one of the first real fallback candidates. Most local results
look usable, but `Піца "Поло"` is already below a stronger local-confidence
threshold.

### Kvarts

Store identifiers:

- `spot_id = 1`
- `storage_id = 3`

Changed `min_stock`:

- `Піца "Гавайська"`: `2 -> 3`
- `Піца "Грибна"`: `1 -> 2`
- `Піца "Поло"`: `1 -> 2`

Weak local signals:

- `Піца "Поло"`: `available_days_14d = 5`

Interpretation:

`Кварц` remains a practical fallback case. The local signal for `Піца "Поло"`
is very thin.

### Klub

Store identifiers:

- `spot_id = 18`
- `storage_id = 52`

Changed `min_stock`:

- `Піца "Грибна"`: `2 -> 3`
- `Піца "Італійська"`: `5 -> 6`
- `Піца "М*ясна"`: `7 -> 8`
- `Піца "Особлива"`: `1 -> 3`
- `Піца "Пепероні"`: `1 -> 2`
- `Піца "Поло"`: `1 -> 2`

Weak local signals:

- `Піца "Особлива"`: `available_days_14d = 5`

Interpretation:

`Клуб` is still one of the most sensitive stores. It has several material
changes and one clearly weak SKU.

### Bulvar

Store identifiers:

- `spot_id = 21`
- `storage_id = 45`

Changed `min_stock`:

- `Піца "Американська"`: `1 -> 2`
- `Піца "Європейська"`: `1 -> 2`
- `Піца "Сирна"`: `1 -> 3`

Weak local signals:

- `Піца "Сирна"`: `available_days_14d = 4`

Interpretation:

`Бульвар` is the strongest fallback case in the validated set so far. The
change for `Піца "Сирна"` is too thin to trust as a purely local signal.

### Biloruska

Store identifiers:

- `spot_id = 20`
- `storage_id = 44`

Changed `min_stock`:

- `Піца "Італійська"`: `1 -> 2`
- `Піца "Кватро Формаджі"`: `1 -> 2`
- `Піца "Мисливська"`: `1 -> 2`

Weak local signals:

- none under `< 7`

Interpretation:

`Білоруська` is moderate. It has a few upward corrections, but no critically
thin SKUs in the current corrected window.

### Hertsena

Store identifiers:

- `spot_id = 3`
- `storage_id = 9`

Changed `min_stock`:

- `Піца "Італійська"`: `1 -> 2`

Weak local signals:

- none

Interpretation:

`Герцена` remains one of the cleanest control stores. The new logic stays close
to the legacy logic, which is what you want when availability is already
healthy.

### Heroiv Maidanu

Store identifiers:

- `spot_id = 8`
- `storage_id = 5`

Changed `min_stock`:

- `Піца "Американська"`: `3 -> 2`
- `Піца "Грибна"`: `1 -> 2`
- `Піца "Кватро Формаджі"`: `2 -> 3`
- `Піца "Сирна"`: `4 -> 3`
- `Піца "Тонно" (з тунцем і шпинатом)`: `1 -> 2`

Weak local signals:

- `Піца "Тонно" (з тунцем і шпинатом)`: `available_days_14d = 6`

Interpretation:

`Героїв Майдану` is a mixed-direction store. The pilot raises some SKUs, lowers
 others, and already shows one thin local signal.

### Graviton

Store identifiers:

- `spot_id = 5`
- `storage_id = 2`

Changed `min_stock`:

- `Піца "Особлива"`: `1 -> 2`
- `Піца "Пепероні"`: `1 -> 2`
- `Піца "Поло"`: `1 -> 2`

Weak local signals:

- none

Interpretation:

`Гравітон` is stable. The signal is usable locally and the uplift is moderate.

### Entuziastiv

Store identifiers:

- `spot_id = 9`
- `storage_id = 20`

Changed `min_stock`:

- `Піца "Грибна"`: `2 -> 3`
- `Піца "Ді Шпіначіо"`: `1 -> 2`
- `Піца "Італійська"`: `4 -> 5`
- `Піца "Сирна"`: `4 -> 5`

Weak local signals:

- none

Interpretation:

`Ентузіастів` shows a strong but still stable local signal. No SKU is below the
 weak-data threshold.

### Kyiv

Store identifiers:

- `spot_id = 13`
- `storage_id = 33`

Changed `min_stock`:

- `Піца "Пепероні"`: `1 -> 2`
- `Піца "Сирна"`: `1 -> 2`

Weak local signals:

- `Піца "Пепероні"`: `available_days_14d = 6`

Interpretation:

`Київ` is mostly stable, but `Пепероні` is already a fallback candidate.

### Komarova 26 kruh

Store identifiers:

- `spot_id = 7`
- `storage_id = 21`

Changed `min_stock`:

- `Піца "Верона"`: `1 -> 2`
- `Піца "Особлива"`: `1 -> 2`
- `Піца "Поло"`: `1 -> 2`

Weak local signals:

- `Піца "Поло"`: `available_days_14d = 6`

Interpretation:

`Комарова 26 круг` is a moderate uplift store with one thin SKU that should be
 watched in fallback policy.

### Kompas

Store identifiers:

- `spot_id = 17`
- `storage_id = 53`

Changed `min_stock`:

- `Піца "Гавайська"`: `1 -> 2`
- `Піца "Європейська"`: `1 -> 2`

Weak local signals:

- none

Interpretation:

`Компас` is clean and low-risk for local use.

### Mikroraion

Store identifiers:

- `spot_id = 19`
- `storage_id = 43`

Changed `min_stock`:

- `Піца "Гавайська"`: `2 -> 3`
- `Піца "Ді Шпіначіо"`: `1 -> 2`
- `Піца "Європейська"`: `3 -> 4`
- `Піца "Особлива"`: `1 -> 2`
- `Піца "Поло"`: `1 -> 3`

Weak local signals:

- `Піца "Ді Шпіначіо"`: `available_days_14d = 5`
- `Піца "Поло"`: `available_days_14d = 4`

Interpretation:

`Мікрорайон` has strong upward corrections, but it also contains clearly thin
 local windows for multiple SKUs.

### Prospekt

Store identifiers:

- `spot_id = 4`
- `storage_id = 7`

Changed `min_stock`:

- `Піца "Гавайська"`: `1 -> 2`
- `Піца "Італійська"`: `2 -> 3`
- `Піца "Кватро Формаджі"`: `3 -> 4`
- `Піца "Особлива"`: `1 -> 2`
- `Піца "Пепероні"`: `1 -> 2`

Weak local signals:

- none

Interpretation:

`Проспект` has several meaningful uplifts, but the local signal remains strong.

### Ruska

Store identifiers:

- `spot_id = 6`
- `storage_id = 6`

Changed `min_stock`:

- `Піца "Верона"`: `2 -> 3`
- `Піца "М*ясна"`: `6 -> 8`
- `Піца "Особлива"`: `2 -> 3`
- `Піца "Пепероні"`: `1 -> 2`
- `Піца "Поло"`: `1 -> 2`

Weak local signals:

- `Піца "Поло"`: `available_days_14d = 6`

Interpretation:

`Руська` shows several large corrections and one weak SKU. It is not as thin as
 `Бульвар`, but fallback still matters for part of the assortment.

### Sadgora

Store identifiers:

- `spot_id = 10`
- `storage_id = 25`

Changed `min_stock`:

- `Піца "Американська"`: `1 -> 2`
- `Піца "Кватро Формаджі"`: `1 -> 2`
- `Піца "М*ясна"`: `1 -> 2`
- `Піца "Особлива"`: `1 -> 2`
- `Піца "Сирна"`: `1 -> 2`

Weak local signals:

- `Піца "М*ясна"`: `available_days_14d = 5`
- `Піца "Поло"`: `available_days_14d = 5`, but `min_stock` does not change

Interpretation:

`Садгора` has broad upward drift, but part of that signal is thin and should be
 threshold-controlled.

### Sadova

Store identifiers:

- `spot_id = 15`
- `storage_id = 34`

Changed `min_stock`:

- `Піца "Американська"`: `1 -> 2`
- `Піца "Козацька"`: `1 -> 2`
- `Піца "М*ясна"`: `2 -> 3`
- `Піца "Пепероні"`: `1 -> 2`

Weak local signals:

- none under `< 7`

Interpretation:

`Садова` remains a strong local-signal store with moderate uplifts.

### Storozhynets

Store identifiers:

- `spot_id = 11`
- `storage_id = 26`

Changed `min_stock`:

- `Піца "Американська"`: `1 -> 2`
- `Піца "Ді Шпіначіо"`: `1 -> 2`
- `Піца "Кватро Формаджі"`: `1 -> 2`
- `Піца "Козацька"`: `1 -> 2`
- `Піца "Сирна"`: `1 -> 2`

Weak local signals:

- `Піца "Ді Шпіначіо"`: `available_days_14d = 6`

Interpretation:

`Сторожинець` is mostly usable locally, but `Ді Шпіначіо` already sits in the
 thin-data zone.

### Khotynska

Store identifiers:

- `spot_id = 16`
- `storage_id = 39`

Changed `min_stock`:

- `Піца "Грибна"`: `1 -> 2`
- `Піца "Італійська"`: `1 -> 2`
- `Піца "Особлива"`: `1 -> 2`
- `Піца "Пепероні"`: `1 -> 2`

Weak local signals:

- `Піца "Особлива"`: `available_days_14d = 4`
- `Піца "Пепероні"`: `available_days_14d = 6`

Interpretation:

`Хотинська` is another store where the local formula works, but fallback is
 clearly needed for selected SKUs.

### Cheremosh

Store identifiers:

- `spot_id = 12`
- `storage_id = 30`

Changed `min_stock`:

- `Піца "Американська"`: `1 -> 2`
- `Піца "Грибна"`: `1 -> 2`
- `Піца "Ді Шпіначіо"`: `1 -> 2`
- `Піца "Європейська"`: `1 -> 2`
- `Піца "Італійська"`: `1 -> 2`
- `Піца "Кватро Формаджі"`: `2 -> 3`
- `Піца "Особлива"`: `1 -> 2`
- `Піца "Сирна"`: `1 -> 2`

Weak local signals:

- `Піца "Ді Шпіначіо"`: `available_days_14d = 3`
- `Піца "Особлива"`: `available_days_14d = 5`

Interpretation:

`Черемош` has the broadest uplift set among the remaining stores, but part of
 it rests on very thin availability windows.

## Current status

At the end of the corrected legacy-window recalculation, before live rollout:

- production formula: unchanged
- corrected read-only pilot: completed for 23 stores
- additive migration: prepared, not applied
- production flag rollout: not started

Nothing in this historical block should be treated as current production state.

## Production rollout final state

Current live state:

- corrected read-only pilot: completed for 23 stores
- additive migration: applied in production
- merge-view rollout layer: live
- per-store feature flags: enabled for all 23 stores
- three-stage distribution function: unchanged
- OOS-aware `avg_sales_day` and `min_stock`: live in production

Operationally important production findings:

- the fallback rule `available_days_14d < 7 -> sales_14d / 14` is part of the
  live OOS view
- the duplicate-store bug on `Садова` was fixed at the owner layer by
  deduplicating `spot_id -> storage_id` selection in the OOS source
- `stock_now` remained a legacy-owned field throughout the rollout and was not
  changed by the OOS logic
- the three-stage distribution function did not require code or signature
  changes

## Network uplift summary

Across the full validated network of 23 stores:

- total positive `min_stock` changes: `88`
- unique pizza SKUs with at least one positive change: `16 of 16`
- `+1` uplift cases: `84`
- `+2` uplift cases: `4`

The four `+2` cases are:

- `Руська` -> `Піца "М*ясна"`: `6 -> 8`
- `Клуб` -> `Піца "Особлива"`: `1 -> 3`
- `Мікрорайон` -> `Піца "Поло"`: `1 -> 3`
- `Бульвар` -> `Піца "Сирна"`: `1 -> 3`

The largest number of uplifted SKUs by pizza is:

- `Піца "Особлива"`: `10` stores
- `Піца "Гавайська"`: `8` stores
- `Піца "Італійська"`: `8` stores
- `Піца "Пепероні"`: `7` stores
- `Піца "Грибна"`: `6` stores
- `Піца "Американська"`: `6` stores
- `Піца "Кватро Формаджі"`: `6` stores
- `Піца "Поло"`: `7` stores

## Rollout implications

The validated stores now separate into two groups.

Stores with no clear fallback pressure:

- `Рівненська`
- `Роша`
- `Квартал`
- `Білоруська`
- `Герцена`
- `Гравітон`
- `Ентузіастів`
- `Компас`
- `Проспект`
- `Садова`

Stores where fallback threshold is already a practical issue:

- `Героїв Майдану`
- `Шкільна`
- `Кварц`
- `Клуб`
- `Бульвар`
- `Київ`
- `Комарова 26 круг`
- `Мікрорайон`
- `Руська`
- `Садгора`
- `Сторожинець`
- `Хотинська`
- `Черемош`

This means the fallback rule is no longer theoretical. It must be defined
before production rollout.

## Next steps

The next operational steps are:

1. Freeze this 23-store pilot as the baseline for rollout decisions.
2. Measure `available_days_14d` distribution for all `store x SKU` pairs and
   set the fallback threshold from the actual network data.
3. Open a write-capable path to apply the additive migration safely.
4. Roll out the new formula under a flag for one pilot store first.
5. Compare ERP output after the flag rollout, then expand store by store.

## Post-rollout next steps

1. Monitor live network totals and spot-level diffs for several days.
2. Watch thin-signal SKUs and verify that the fallback threshold stays
   appropriate.
3. Decide whether old confirmed reservations for past dates should be cleaned
   automatically.
4. Keep `docs/pizza-current-production-snapshot-2026-03-27.csv` as the frozen
   pre-rollout baseline for future comparisons.
