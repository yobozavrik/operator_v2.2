# ERP Redesign Plan

## Goal
Перевести Production Hub із модульного/цехового входу в рольову ERP-оболонку для трьох ключових ролей:
- Власник
- Операційний директор
- Начальник виробництва

## First implementation slice
В рамках первого этапа внедряем новый верхний слой продукта:
- `/` — role-based home / command hub
- `/owner` — executive workspace
- `/ops` — operations workspace
- `/production-chief` — shift workspace
- `/workshops` — workshop selection layer

Текущие цеховые и специализированные модули сохраняются и используются как drill-down:
- `/graviton`
- `/production`
- `/finance`
- `/forecasting`
- `/bakery`
- `/pizza`
- `/konditerka`
- `/bulvar`
- `/florida`

## Target IA
- Home
- Owner
- Ops
- Production Chief
- Workshops
- Finance
- Forecasting
- Admin

## Mapping: current → target
- `/` → Role hub + network status + critical attention
- `/finance` → Owner / Financial view
- `/forecasting` → Owner + Ops / scenario & forecast drill-down
- `/graviton` → Ops / workshop drill-down
- `/production` → Production Chief / shift execution drill-down
- `/pizza`, `/konditerka`, `/bulvar`, `/florida`, `/bakery` → Workshops / domain-specific drill-down

## UX principles
1. Role first, module second.
2. Signal → cause → action.
3. One semantic color system for statuses.
4. Fewer decorative effects, stronger information hierarchy.
5. Existing workshop modules remain available, but no longer define the top-level user journey.

## Delivery model (hybrid with Antigravity)
### This agent
- IA / sitemap
- role model
- route structure
- UX logic
- component/system cleanup
- code-level implementation of the structural shell

### Antigravity
- visual language
- polish / motion
- final UI detailing
- brand-level presentation

## Recommended next coding steps
1. Rebuild top-level navigation around roles.
2. Create shared shell for role pages.
3. Unify workshop entry patterns.
4. Normalize status cards, alerts, KPI rows.
5. Hand over stable structural layer to Antigravity for visual refinement.

## Stage 2 delivered
- shared role shell component
- top role navigation
- unified `/owner`, `/ops`, `/production-chief`
- dedicated `/workshops` layer between role pages and existing modules

## Stage 3 in progress
- bridge old modules into the new IA
- connect `/graviton`, `/production`, `/finance` back to role/workshop context
- reduce the architectural gap between legacy screens and new top-level navigation
- normalize UX language and decision flow across Graviton, store drill-down, and order confirmation
