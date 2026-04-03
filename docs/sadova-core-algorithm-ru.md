# Анализ алгоритма распределения Садова (Sadova)

Данный документ описывает внутреннее устройство алгоритма логистики цеха "Садова", детализируя 3-этапное распределение (`fn_run_distribution_v4`) и его особенности по сравнению с основным алгоритмом Гравитона. Все описания приведены на русском языке согласно продуктовым требованиям.

---

## 1. Clean Architecture (Архитектура алгоритма)

Система логистики строго отвязана от UI и работает на уровне Use Cases внутри PostgreSQL, предоставляя интерфейсы (Interface Adapters) через Next.js API. Схема данных инкапсулирована в `sadova1`.

```mermaid
flowchart TD
    subgraph Infrastructure
        DB[(Supabase PostgreSQL: sadova1)]
        Poster[Poster POS API]
    end

    subgraph Interface Adapters
        API1[POST /api/sadova/distribution/run]
        API2[GET /api/sadova/distribution/results]
        API3[GET /api/sadova/shops]
    end

    subgraph Use Cases
        V4[fn_run_distribution_v4]
        ORC[fn_orchestrate_distribution_live]
    end

    subgraph Entities
        DR[distribution_results]
        DBA[distribution_base]
        ST[distribution_input_stocks]
        PR[distribution_input_production]
    end

    API1 --> ORC
    ORC --> V4
    V4 --> DR
    V4 --> DBA
    V4 --> ST
    V4 --> PR

    API2 --> DR
    API1 --> Poster
    
    Use Cases --> Infrastructure
```

- **Entities**: Хранят текущее состояние. В схеме `sadova1` присутствуют сущности `delivery_debt` (долги магазинов) и `production_daily` (кеш производства), что обеспечивает паритет с системой Гравитон.
- **Use Cases**: Основная бизнес-логика. Сбор живых остатков с Poster (с автоматической конверсией грамм -> кг), вызов `fn_orchestrate_distribution_live` и расчет `fn_run_distribution_v4` с учетом накопленного долга.
- **Interface Adapters**: Next.js API, которые нормализуют данные и передают их в Supabase RPC. Все весовые данные на этом слое приводятся к килограммам.

---

## 2. Логика распределения: `fn_run_distribution_v4`

Функция оперирует ресурсом (`pool` произведенной сегодня продукции из `distribution_input_production`) и распределяет его между выбранными магазинами в 3 этапа.

### 2.1 Подготовка данных
Алгоритм собирает метрики магазина: `min_stock`, `avg_sales_day` (из `distribution_base`), и джоинит живые остатки `effective_stock` (из `distribution_input_stocks`).

### 2.2 Этапы работы алгоритма (Live Mode)

```mermaid
flowchart TD
    Start[Начало расчета] --> Prep[Сбор метрик и остатков\n(temp_calc_sadova)]
    
    Prep --> Stage1[Этап 1: Раздача по 1 шт\n'нулевым' магазинам]
    
    Stage1 --> Condition1{Остался\npool?}
    Condition1 -- Нет --> Save[Сохранение результата]
    
    Condition1 -- Да --> Stage2[Этап 2: Покрытие min_stock]
    Stage2 --> NeedCalc["temp_need = GREATEST(0,\nmin_stock - effective_stock)"]
    
    NeedCalc --> Condition2{Хватает\npool?}
    Condition2 -- Да --> GiveFull[Раздача 100% потребности]
    Condition2 -- Нет --> GiveProp[Пропорциональная\nраздача (к-т K)]
    
    GiveFull --> Condition3{Остался\npool?}
    GiveProp --> Condition3
    
    Condition3 -- Нет --> Save
    Condition3 -- Да --> Stage3[Этап 3: Top-up насыщение]
    Stage3 --> Mult["Множитель\n(от 2x до 4x min_stock)"]
    Mult --> Save
    
    Save --> End[Конец]
```

- **Этап 1 (Спасение)**: Выдача по 1 единице всем активным магазинам с `effective_stock = 0`.
- **Этап 2 (Балансировка)**: Покрытие спроса уровня `min_stock`. Формула: `temp_need = min_stock - effective_stock`.
- **Этап 3 (Насыщение)**: Раздача излишков успешным магазинам до 4-кратного размера `min_stock`. Наращивание множителя идет плавно (2x -> 3x -> 4x).
- **Сброс остатков на склад**: Оставшийся `pool` (если распределение выполнялось по всей сети) фиксируется как "Остаток на Складе".

---

## 3. Интеграция долгов (Delivery Debt)

Начиная с версии 2026-04-03, в Садове активирован механизм учета долгов, аналогичный Гравитону:

1. **Фиксация**: При подтверждении доставки (`fn_confirm_delivery`), недопоставленный товар по выбранным магазинам автоматически попадает в `sadova1.delivery_debt`.
2. **Учет в расчете**: `fn_run_distribution_v4` выполняет LEFT JOIN с таблицей долгов. Потребность магазина (Need) теперь включает сумму долга: `need = GREATEST(0, min_stock + debt_kg - effective_stock)`.
3. **Приоритет**: Магазины с долгом получают приоритет на Этапе 2 распределения.
4. **Очистка**: При успешной доставке (подтверждении в UI) борг обнуляется.

---

## 4. Нормализация весов (Весовая политика)

Важной особенностью Садовы является работа с Poster POS, который отдает сырые данные в граммах для весовых товаров (пельмени, вареники).

- **API Layer**: Все входящие данные от Poster делятся на 1000 перед сохранением в `distribution_input_stocks` и `production_daily`.
- **Database**: Все расчеты в SQL и значения во вьюхах проводятся в **килограммах**.
- **UI**: Отображает значения в кг, округляя до целых или 1 знака после запятой.

---

## 4. Swagger / OpenAPI (Interface Layer)

Контракты для взаимодействия UI с Садова-алгоритмом:

```yaml
openapi: 3.0.3
info:
  title: Sadova Distribution API
  version: 1.0.0
paths:
  /api/sadova/distribution/run:
    post:
      summary: Запуск live-расчёта Садова
      description: |
        Вытягивает живые остатки из Poster, сохраняет их в `distribution_input_stocks`, 
        производит расчет (v4) через `fn_run_distribution_live` или `fn_orchestrate_distribution_live`.
        Поддерживает частичный запуск (только по выбранным магазинам).
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                shop_ids:
                  type: array
                  items:
                    type: integer
                  nullable: true
                  description: ID магазинов. Если null - распределение на всю сеть.
      responses:
        "200":
          description: Успешный расчет
          content:
            application/json:
              example:
                success: true
                batch_id: "uuid"
                products_processed: 15
                total_kg: 24.5
                live_sync:
                  partial_sync: false
                  failed_storages: []

  /api/sadova/distribution/results:
    get:
      summary: Получение результатов
      description: Отдает текущее (сегодняшнее) распределение из `v_sadova_today_distribution`.
      responses:
        "200":
          description: Массив результатов

  /api/sadova/shops:
    get:
      summary: Список активных магазинов
      description: Выборка из `distribution_shops` для отображения фильтров.
```

---

## 5. Бизнес-риски и Диагностика (Слепые зоны)

Поскольку система вычисляет распределение "на лету" (в момент нажатия кнопки), она подвержена тем же рискам, связанным с интеграцией Poster:

1. **Риск "Нулевых остатков"** 
   Если API Poster или Edge Function отвалится по таймауту, система вернет пустые остатки для конкретного магазина.
   - Магазин попадает в `failed_storages`.
   - Флаг `partial_sync = true` активируется в API.
   - Если расчет продолжится, магазин "стянет" на себя лишнюю продукцию из-за иллюзии нулевых остатков.

2. **Риск "Опоздавшего пекаря"**
   Аналогично Гравитону: если пекарь провел в кассе только половину произведенного товара на момент нажатия кнопки "Run distribution", распределена будет только эта половина. 
   - Это лечится организационным регламентом: генерировать лист распределения **только** после полного закрытия смены и проведения всех накладных в цеху.
