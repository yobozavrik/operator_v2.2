# Session Handoff

## Current Project State
Проєкт: `D:\operator-main`

Це ERP / Production Hub, який поступово переводиться з модульного/цехового входу в рольову управлінську оболонку.

## What Has Already Been Done
### New top-level structural layer added
Створено або почато використовувати:
- `/`
- `/owner`
- `/ops`
- `/production-chief`
- `/workshops`

### Shared structural components added
- `role-shell`
- `context-bridge`

### Architecture direction already started
- Старі модулі почали підключатися назад до нової role-based IA.
- Почалася перебудова навігації та верхнього шару продукту.

## Current Priority
### Priority 1
Завершити **повну українізацію та смислову чистку Graviton**.

Ключові файли:
- `src/components/graviton/BIDashboard.tsx`
- `src/components/BIPowerMatrix.tsx`
- `src/components/StoreSpecificView.tsx`
- `src/components/OrderConfirmationModal.tsx`

### Priority 2
Зберегти сильну карткову сітку Graviton, але посилити:
- семантику
- порядок
- дії
- підписи
- консистентність

### Priority 3
Після Graviton перейти до:
- `production`
- далі `finance / owner layer`

## Important Product Decisions Already Made
- З користувачем (Дімою) спілкування ведеться російською.
- Увесь інтерфейс ERP має бути українською.
- Не ламати сильні робочі патерни заради редизайну.
- Карткова сітка Graviton вважається сильною основою й не повинна зноситися без вагомої причини.
- Головна задача — не "зробити красиво", а зробити систему правильнішою, ефективнішою та зрозумілішою.

## Product Lens
Система має бути зрозумілою для 3 ролей:
- Власник
- Операційний директор
- Начальник виробництва

## Known Problem Areas
За підсумками аудиту, найбільш проблемні з точки зору мови й консистентності файли:
- `src/app/page.tsx`
- `src/components/layout.tsx`
- `src/components/graviton/BIDashboard.tsx`
- `src/components/BIPowerMatrix.tsx`
- `src/components/StoreSpecificView.tsx`
- `src/components/OrderConfirmationModal.tsx`
- `src/app/bakery/page.tsx`

## Recommended Working Mode
Наступна сесія має працювати так:
1. брати один завершений блок
2. вносити правки
3. проганяти збірку
4. повертатися з чітким звітом:
   - які файли змінено
   - що зроблено
   - що стало краще
   - що наступне

## Next Concrete Block
Найближчий завершений блок:
**Graviton language + semantics cleanup**

Ціль блоку:
- довести Graviton до чистої української мови в UI
- зберегти сильний картковий патерн
- посилити логіку сигналів, підписів, модалок та дій
