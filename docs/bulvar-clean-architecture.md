# Bulvar Clean Architecture

Bulvar is an operational domain. The rule is simple: keep stock, production, and distribution logic in the owner layer and never compensate for broken data in the UI.

The current presentation shell is intentionally aligned with Florida and Konditerka: light panels, shared dashboard layout, card-based metrics, and the same tab/state patterns. The live analytics surface and the production surface now share the same visual language, but styling must never become a second source of truth for business calculations.

## Layers

```mermaid
flowchart TB
    Presentation["Presentation layer<br/>/bulvar pages and components"] --> Application["Application layer<br/>Next.js route handlers"]
    Application --> Domain["Domain / owner logic<br/>Supabase views + RPC + normalized snapshots"]
    Domain --> Infrastructure["Infrastructure layer<br/>Poster sync + raw edge data + catalog refresh"]
```

## Presentation Layer

Presentation includes:

- `/bulvar`
- `/bulvar/production`
- `BulvarProductionTabs.tsx`
- `BulvarAnalyticsDashboard.tsx`
- `BulvarPowerMatrix.tsx`
- `BulvarDistributionControlPanel.tsx`
- `BulvarProductionOrderTable.tsx`
- `BulvarOrderFormTable.tsx`
- `BulvarProductionDetailModal.tsx`
- `BulvarDistributionModal.tsx`
- `BulvarHistoricalProduction.tsx`
- `BulvarProductionSimulator.tsx`
- shared `DashboardLayout` shell used by Florida/Konditerka as the visual baseline

Presentation responsibilities:

- render only owner-backed read models
- follow the shared light-card UI system from Florida/Konditerka
- show `кг` values with two decimals where the UI asks for weights
- show `шт` values as integers
- hide product cards when total stock is zero
- keep alphabetical sorting as a presentation concern only
- do not merge Poster leftovers into the matrix
- do not recompute `min_stock` or `need_net` in the UI
- keep the route shell, tab shell, and card shell purely presentational
- prefer `ingredient_id` matching first and use normalized name matching only as a fallback when rendering live stocks

## Application Layer

Application includes the route handlers under `src/app/api/bulvar/*`.

Application use cases:

- `LoadBulvarOrders`
- `LoadBulvarSummary`
- `LoadBulvarProductionDetail`
- `RefreshBulvarStockSnapshot`
- `RefreshBulvarCatalog`
- `RefreshBulvarProductionSnapshot`
- `RunBulvarDistribution`
- `ReadBulvarDistributionResults`
- `LoadBulvarAnalytics`
- `LoadBulvarOrderPlan`
- `LoadBulvarProduction180d`
- `LoadBulvarShopStats`
- `LoadBulvarFinance`
- `CalculateBulvarDistribution`
- `ConfirmBulvarDistribution`
- `CreateBulvarOrder`
- `LoadBulvarTrends`
- `RunBulvarScheduledDistribution`

Application responsibilities:

- call the owner views and RPC functions
- normalize payloads for the UI contract
- keep the manual run path orchestration-only
- never fallback to child-layer recalculation when the owner view is available
- keep `POST /api/bulvar/distribution/run` thin and deterministic
- keep `POST /api/bulvar/update-stock` as the ingestion boundary for catalog, normalized stock snapshot, and production snapshot refresh

## Domain / Owner Layer

Owner sources:

- `bulvar1.production_180d_products`
- `bulvar1.effective_stocks`
- `bulvar1.v_bulvar_production_only`
- `bulvar1.v_bulvar_distribution_stats_x3`
- `bulvar1.v_bulvar_summary_stats`
- `bulvar1.v_bulvar_trends_14d`
- `bulvar1.distribution_results`
- `bulvar1.fn_full_recalculate_all()`
- `bulvar1.fn_run_distribution_v3(...)`
- `bulvar1.product_packaging_config`

Core domain rules:

- the product catalog is the whitelist for visible cards
- `production_180d_products` is refreshed from Poster catalog ownership
- `effective_stocks` is the normalized stock snapshot produced by the edge sync
- `v_bulvar_distribution_stats_x3` is the canonical operational read model
- `avg_sales_day`, `min_stock`, and `need_net` come from the owner view, not the UI
- `unit` comes from the owner row and must not be hardcoded in presentation logic
- `distribution_results` is the persisted output of the daily run
- the runner may sync inputs before the RPC, but the allocation math must remain in Supabase
- the manual distribution path must not emit a custom fallback algorithm
- `production-detail` is a read-only view of the production and demand state
- `summary` is a read-only KPI aggregation
- `update-stock` refreshes catalog, normalized live stock snapshot, and production snapshot
- the standardized UI shell is a view concern only and does not change the owner contract

## Infrastructure Layer

Infrastructure responsibilities:

- pull production snapshots from Poster
- refresh `production_180d_products`
- refresh the normalized `effective_stocks` snapshot from the edge function
- maintain `v_bulvar_production_only`
- maintain `v_bulvar_summary_stats`
- maintain `v_bulvar_distribution_stats_x3`
- persist rows into `distribution_results`

Infrastructure does not decide visibility rules, row order, or quantity formatting.

## Owner-Source Matrix

| Surface | Owner source | Notes |
|---|---|---|
| `/api/bulvar/orders` | `v_bulvar_distribution_stats_x3` + `production_180d_products` | Main operational read for the matrix |
| `/api/bulvar/summary` | `v_bulvar_summary_stats` + `v_bulvar_distribution_stats_x3` | KPI header read |
| `/api/bulvar/production-detail` | `v_bulvar_production_only` + `v_bulvar_distribution_stats_x3` + `production_180d_products` | Production fact + demand detail |
| `/api/bulvar/production-180d` | `production_180d_products` + `refresh_production_180d_products()` | 180-day catalog read |
| `/api/bulvar/trends` | `v_bulvar_trends_14d` | 14-day trend read |
| `/api/bulvar/finance` | `v_gb_finance_overview` + `v_gb_top_products_analytics` | Finance dashboard payload |
| `/api/bulvar/update-stock` | `syncBulvarCatalogFromPoster()` + `syncBulvarStocksFromEdge()` + `fetchBulvarEdgeStocks()` fallback + `effective_stocks` + `v_bulvar_production_only` | Refreshes catalog, normalized stock snapshot, and production snapshot |
| `/api/bulvar/distribution/run` | `fn_full_recalculate_all()` + `distribution_results` | Orchestrates sync then owner-layer recalculation |
| `/api/bulvar/distribution/scheduled-run` | `distribution_results` + `distribution_email_log` + `fn_full_recalculate_all()` | Cron email orchestration |
| `/api/bulvar/distribution/results` | `distribution_results` | Delivery and Excel-facing read model |
| `/api/bulvar/calculate-distribution` | Branch rows + in-memory split | Manual distribution preview |
| `/api/bulvar/confirm-distribution` | Request payload only | Manual confirmation stub |
| `/api/bulvar/create-order` | Request payload only | Manual order acceptance stub |
| `/api/bulvar/analytics` | `v_bulvar_distribution_stats_x3` | Dashboard metrics |
| `/api/bulvar/order-plan` | `v_bulvar_distribution_stats_x3` | Planning table |
| `/api/bulvar/shop-stats` | `v_bulvar_distribution_stats_x3` | Per-store drilldown |

## Invariants

- Zero-stock product cards are hidden from the product grid.
- The same product reappears automatically when any store stock becomes positive.
- No child-layer policy recomputes `min_stock` when `v_bulvar_distribution_stats_x3` is available.
- `distribution_results` is the only persisted output of the distribution run.
- Manual distribution run is orchestration only.
- `кг` UI metrics use two decimals, piece items are integers.
- Live stock rendering prefers `ingredient_id` and only falls back to normalized names when an identifier is absent or inconsistent.

