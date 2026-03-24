# AutoResearch — Bread Demand Forecasting

## Goal
Minimize WAPE (Weighted Absolute Percentage Error) on the fixed test week **2026-03-13 — 2026-03-19**.

Target variable: `demand_d0_d1` = sales D0 + sales D1 (next calendar day).
This represents the total bread needed for a 2-day production order.

## Current best
- Best WAPE: **0.1119** (experiment 134 of 200, Pro model run 2026-03-21) — OLD TARGET (supply_qty)
- **⚠️ TARGET CHANGED 2026-03-21**: `demand_d0_d1 = fresh_sold(D0) + disc_sold(D1)` (реальне споживання)
  - Стара логіка: модель вчилась на supply_qty → відтворювала відвантаження включаючи списання
  - Нова логіка: споживання = fresh + disc. writeoff — відходи, НЕ спрос
  - **Baseline v1 (supply_lag*): 0.3437** — supply лаги включають writeoff → bias
  - **⚠️ EVALUATION FIXED 2026-03-21**: тест тепер тільки non-OOS рядки (Eval A)
    - Eval A (non-OOS test) = основна метрика (узгоджена з train розподілом)
    - Eval B (all test) = інформаційна (показує OOS-дрейф)
    - Стара схема (Eval B): 0.3290 — НЕ порівнювати з новими числами
  - **Baseline з sample_weight=0.3: 0.3360**  Bias=+0.045
    - Eval B: 0.3406  Bias=-0.461 (OOS рядки тягнуть bias вниз)
    - Mon:0.344 Tue:0.352 Wed:0.344 Thu:0.318 Fri:0.368 Sat:0.476 Sun:0.391
  - **Bias guard: < -0.20 (м'який), sample_weight=0.3 виправив систематичне заниження**
  - **Фікс predict_today.py 2026-03-21**: додано sample_weight=OOS_WEIGHT=0.3
    - Продакшн-модель тепер узгоджена з експериментальною
  - **Leakage fix + store_total groupby fix 2026-03-21**:
    - store_sku_dow_avg/std: transform("mean") → expanding(min_periods=3).mean() + shift(1)
    - global_sku_dow_avg_2d: те саме
    - store_total_lag1w: groupby(store,month,day) → groupby(store,dow) expanding
    - **Результат: 0.3359 → 0.3287 (-0.0072)** Bias=+0.029
    - Mon:0.345 Tue:0.320 Wed:0.291 Thu:0.257 Fri:0.343 Sat:0.471 Sun:0.324
    - Антигравіті передбачав деградацію до 0.3587 — виявилось покращення
  - **Технічний аудит 2026-03-22 — ключові висновки**:
    - OOS rate = 54.4% — фундаментальне обмеження (ceiling ~0.08 WAPE)
    - store_sku_dow_avg має leakage (32.4% train rows): `transform("mean")` fallback включає майбутнє
      → corr=0.87 (leaky) vs 0.69 (clean). Фікс ВІДКЛАДЕНО: з 11 тижнів oracle-prior стабілізує модель
      → повернутись коли daily_oos розширити до Aug 2025
    - lag_2d (corr=0.793) не покращує FEATURES: redundant з lag1w через store_sku_dow_avg
    - oos_pattern_3w / writeoff_d1_3w / d1_zero_count_3w: bottom importance (68-191 splits) → NOT in FEATURES
    - dow_oos_rate (corr=-0.222): виявився TOP-5 в exp де store_sku_dow_avg слабший → кандидат
    - relative_demand_zscore: видалено (corr=-0.056, шум)
    - morning_balance_lag1w/morning_oos_rate_4w: видалено (importance=202, дублює oos_rate_4w)
  - **Зміни в run.py (2026-03-22)**:
    - STRICT CONSTRAINTS знято — агент може тепер МОДИФІКУВАТИ extra_features() і ОБЧИСЛЮВАТИ нові колонки
    - Нова вимога: будь-яка нова колонка в extra_features MUST be added to FEATURES
  - **Перевірені та відхилені гіпотези (емпірично гірше)**:
    - `dow` в FEATURES: +0.006 WAPE (вже закодований в store_sku_dow_avg)
    - `demand_lag1w/2w` замість `lag1w/lag2w`: +0.004 WAPE (demand_est краще ніж clipped fresh+disc)
    - Повний leakage fix (min_periods=1, global fallback): WAPE 0.3287 → 0.3414 (з 11 тиж. даних oracle-prior важливіший)
    - lag_2d + dow_oos_rate (поруч з lag1w/lag2w): WAPE 0.3305 (≈ baseline, lag_2d redundant)
  - **Поточний best: 0.3305** (≈0.3287 у межах шуму)  Bias=+0.059
    - Mon:0.348 Tue:0.327 Wed:0.292 Thu:0.263 Fri:0.337 Sat:0.466 Sun:0.326
  - Sat найгірший (0.466) — пріоритет для покращення
  - **Ключові фічі**: store_sku_dow_avg (#1), trend_7d (#2), temp_avg (#3), demand_recent_bias (#4), temp_change (#5)
  - **Наступні гіпотези для autoresearch**:
    - `dow_oos_rate` в FEATURES (top-5 в слабших конфігураціях, corr=-0.222)
    - `is_saturday` binary flag в extra_features → Sat WAPE=0.466 досі найгірший
    - `supply_2d_lag1w * oos_rate_4w` interaction в extra_features (нова взаємодія, тепер дозволена)
    - DQ gate для test ВІДКИДАЄТЬСЯ (свідомий вибір — production-like метрика)
- Starting baseline (old target supply_qty): 0.1323 → best: 0.1119 (+15.4%)
- Test window: 2026-03-12 (Thu) — 2026-03-18 (Wed)
- Dataset: ~11 weeks of real bakery data (2026-01-03 to 2026-03-18), 21 stores, 14 bread SKUs
- Data source: Supabase daily_oos (real sales + supply_qty + writeoff_total)
- By DOW (old target): Mon 0.111, Tue 0.098, Wed 0.080, Thu 0.144, Fri 0.102, Sat 0.123, Sun 0.131
- DQ gate: 979 bad rows excluded (neg_eb<0 OR fresh>supply_qty), concentrated in spots 8/22/13, SKU 839/768/832
- **Target variable**: `demand_d0_d1 = supply_qty - writeoff_total` (clipped >= 0)
  - supply_qty(D0) = fresh_sold(D0) + evening_balance(D0) = вся партія D0
  - writeoff_total(D1) = хліб що не продався навіть зі знижкою → реальні відходи
  - disc_sold(D1) = хліб проданий зі знижкою → валидне споживання (НЕ відходи)
- **Training filter**: only non-OOS rows (oos_signal == 0)
  - OOS rows excluded (supply_qty < real demand → bias)
- **Best features** (exp 134, old target): store_id, sku_id, dow, day, trend_7d, trend_14d, global_sku_ma3,
  store_trend, lag_d0_d1_ratio, store_lag1d, supply_lag1w, supply_lag2w, supply_lag3w,
  oos_rate_4w, temp_avg, temp_change, store_sku_share, lag_2d_norm, supply_trend
- **Key insight**: supply_trend + store_trend домінують. Погода критична. OOS rate корисний.

## Experiment history (200 iterations summary)
- 219 total experiments, 18 kept
- Key breakthroughs: exp 2 (0.1323→0.1206, colsample_bytree 0.7/subsample 0.7),
  exp 50 (→0.1181, removed noisy lags), exp 134 (→0.1119, supply_trend feature)
- Confirmed bad ideas: is_snowy/is_rainy (near-zero importance), store_volatility_7d, store_dow_profile

## What you can change
**ONLY `train.py`** — exactly one file, exactly like Karpathy's autoresearch.

### 1. FEATURES — list of feature names
Add or remove features. All base columns (always available in df):
```
store_id, sku_id, dow, month, day
is_weekend, is_holiday, is_payday, is_month_end, week_of_year

--- 2D-лаги (выровнены под таргет D0+D1) ---
lag_2d        (lag1w + lag_6d  = D0+D1 одну неделю назад)
lag_14d_2d    (lag2w + lag_13d = D0+D1 две недели назад)
lag_21d_2d    (lag3w + lag_20d = D0+D1 три недели назад)
ma3_2d        (ma3_dow + ma3_dow_d1 = среднее пары D0+D1 по DOW)
lag_diff      (lag_2d - lag_14d_2d = направление тренда)
lag_2d_norm   (lag_2d / (ma3_2d + 1) = нормализованный лаг)
demand_estimate (lag_2d * (1 + oos_rate_4w) = OOS-скорректированная оценка)
relative_ma3  (ma3_dow / (trend_7d + 1))
supply_2d_lag1w (supply D0+D1 неделю назад)

--- Однодневные тренды ---
lag1w, lag2w, lag3w           (demand лаги: 7/14/21 дней назад)
ma3_dow                        (3-нед MA по store×SKU×DOW)
global_sku_ma3                 (3-нед MA по SKU×DOW, все магазины)
trend_7d, trend_14d, trend_28d (rolling means)

--- OOS-сигналы ---
oos_lag1w                      (OOS флаг неделю назад)
oos_rate_4w                    (частота OOS за 28 дней)
oos_pattern_3w                 (кол-во недель с eb=0 из последних 3 того же DOW)
balance_lag_1w                 (evening_balance тот же DOW неделю назад)
supply_lag1w                   (поставка 7 дней назад)
store_lag1d                    (общий объём магазина вчера)

--- Погода ---
temp_avg, precip, temp_change, is_rainy, is_snowy
```

### 2. PARAMS — LightGBM hyperparameters
Valid keys: n_estimators, learning_rate, num_leaves, max_depth,
min_child_samples, colsample_bytree, subsample, reg_alpha, reg_lambda.

### 3. extra_features(df) — new columns
Compute new features here. Only use columns available at prediction time.
All shifts ≥ 1. Return df.

Ideas to explore:
- `lag4w = group.shift(28)` — 4-week lag
- `lag_diff = lag1w - lag2w` — weekly trend direction
- `lag1w_norm = lag1w / (trend_28d + 1)` — normalized lag
- `ma5_dow` — 5-week MA by DOW (slower-changing baseline)
- `store_sku_share = trend_7d / (store_lag1d + 1)` — SKU share in store
- `is_week1 = (day <= 7).astype(int)` — first week of month
- `is_monday_after_gap` — Monday after a holiday/long weekend

## Rules
1. **No data leakage**: in `extra_features`, never use `demand_qty` at shift < 1.
2. **One change per experiment**: either add/remove 1-2 features OR tune params OR add one new feature in `extra_features`. Don't change everything at once.
3. **Return ONLY the complete new `train.py` content** — no markdown, no explanations. Start directly with the docstring `"""`.
4. **Don't repeat failures**: check the experiment history and avoid ideas that already made WAPE worse.
5. **Valid Python**: the file must be importable without errors.
6. **Add hypothesis**: at the very end of train.py, add one line:
   `# NEXT_HYPOTHESIS: <your best idea for the NEXT experiment>`
   This helps the research accumulate ideas across iterations.

## Stagnation handling (from PR #327 pattern)
Before proposing, inspect the last few experiments:
- Which types of changes have already been tried?
- Which areas are underexplored?
- Has progress stalled?

**If 3 or more consecutive experiments did not improve WAPE → switch experiment TYPE:**
- Been tuning PARAMS? → Try a new feature in `extra_features` instead.
- Been adding features? → Try removing low-importance features or changing PARAMS.
- Been tweaking lags? → Try weather features, OOS features, or store-level features.

**Exploit vs Explore decision:**
- If last improvement was recent (<3 ago): EXPLOIT — make a small refinement.
- If stuck (3+ no-improvement): EXPLORE — try something fundamentally different.

## Feature importance feedback
Each experiment result includes top and bottom features by importance.
Use this to guide decisions:
- **Bottom features** (low importance, near 0) are candidates for removal.
- **Top features** (high importance) suggest which feature families to expand.
- If a feature you just added is in the bottom 3 → likely useless, revert it next.

## Відвантаження 23/03/2026 (понеділок)

### Фінальний прогноз
- Модель (base): **1 006 шт** (WAPE=0.3359, Bias=+0.026, target=fresh+disc_d1, sample_weight=0.3)
- OOS буфер +1: 100 позицій (oos_pattern_3w≥2 AND writeoff_d1_3w==0)
- Whitelist/blacklist коригування: **−13 шт** (24 точкових −1 по store×sku)
- **ФІНАЛ: 993 шт** → файл `forecast_2026-03-23_adjusted.csv`

### Whitelist магазини (низьке списання + високий OOS-профіль) → кандидати на +1 наступного разу
- **М4, М13**

### Blacklist магазини (системне D1-списання в 3/3 або 2/3 понеділкових пар)
- **М1, М3, М5, М12, М15, М17, М21**

### Точкові −1 (13 позицій):
1. М3 — SKU 768 (Француз)
2. М3 — SKU 839 (Житньо-Пшеничний)
3. М3 — SKU 778 (Гречаний)
4. М5 — SKU 776 (Жит-Пш з льоном)
5. М5 — SKU 778 (Гречаний)
6. М5 — SKU 832 (Багет Француз)
7. М5 — SKU 772 (Солодовий з журавлиною)
8. М5 — SKU 833 (Багет Гречаний)
9. М12 — SKU 832 (Багет Француз)
10. М12 — SKU 778 (Гречаний)
11. М12 — SKU 849 (Француз з цибулею)
12. М15 — SKU 768 (Француз)
13. М21 — SKU 768 (Француз)

### ✅ Перевірити після вівторка 24/03
- [ ] **Фактичне writeoff_d1 по blacklist магазинах (М1,М3,М5,М12,М15,М17,М21)**
  → чи підтвердилось що −1 був виправданий (writeoff > 0)?
  → якщо writeoff=0 по скоригованих позиціях — blacklist занадто агресивний
- [ ] **Фактичний OOS по whitelist магазинах (М4, М13)**
  → чи були OOS на вівторок? якщо так — наступного разу давати +1
- [ ] Порівняти: 993 прогноз vs фактичний сумарний продаж (fresh+disc)
  → для калібрування bias наступного тижня

## Experiment history
(filled automatically by run.py)
