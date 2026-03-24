# Refactor changelog (March 24, 2026)

## Scope

Safe cleanup/refactor only. No business logic change, no API contract change, no
Supabase change.

## Removed and simplified

1. Removed unused imports in API routes:
   - `src/app/api/bakery/analytics/route.ts`
   - `src/app/api/bakery/catalog/route.ts`
   - `src/app/api/bakery/catalog/stores/route.ts`
2. Removed unused imported type:
   - `src/app/api/bulvar/distribution/run/route.ts` (`BranchProductionItem`)
3. Removed dead helper function:
   - `src/app/api/bulvar/distribution/scheduled-run/route.ts` (`toPositiveInt`)
4. Removed unused local variable:
   - `src/app/api/foodcost/route.ts` (`suggestedPrice`)
5. Removed unused UI imports/props:
   - `src/app/hr/page.tsx` (`AreaChart`)
   - `src/app/production-chief/page.tsx` (`Factory`)
   - `src/components/StoreSpecificView.tsx` (`Package`)
   - `src/components/hr/ShiftScheduler.tsx` (`cellKey` prop)
6. Updated ESLint ignores to avoid scanning service artifacts:
   - `eslint.config.mjs` added ignores:
     - `.claude/**`
     - `.agents/**`
     - `artifacts/**`

## Dependencies removed

None in this pass. No dependency was removed without a full usage audit across
all project workflows.

