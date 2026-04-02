# Supabase Client Matrix

This document tracks the migration of all API endpoints to the unified Supabase client architecture.

| Endpoint | Target Client Type | Auth Required | Owner / Deadline | Status |
|---|---|---|---|---|
| `/api/analytics/craft-bread` | TBD (Resolve overlap) | No | Team / TBD | Pending |
| `/api/bakery/analytics` | Server | Yes | Team / TBD | Pending |
| `/api/bakery/catalog` | Server | Yes | Team / TBD | Pending |
| `/api/bakery/catalog/stores` | Server | Yes | Team / TBD | Pending |
| `/api/bakery/oos-balance` | Server | Yes | Team / TBD | Pending |
| `/api/bakery/sales` | Server | Yes | Team / TBD | Pending |
| `/api/bakery/sales/eod-oos` | Server | Yes | Team / TBD | Pending |
| `/api/bakery/sales/export` | Server | Yes | Team / TBD | Pending |
| `/api/graviton/all-products` | Server | Yes | Team / TBD | Pending |
| `/api/graviton/critical-d2` | Admin (Service Role) | No | Team / TBD | Pending |
| `/api/graviton/critical-d3` | Admin (Service Role) | No | Team / TBD | Pending |
| `/api/graviton/deficit/reserve` | Server | Yes | Team / TBD | Pending |
| `/api/graviton/deficit` | Server | Yes | Team / TBD | Pending |
| `/api/graviton/distribution/run` | Admin (Service Role) | Yes | Team / TBD | Pending |
| `/api/graviton/metrics` | Server | Yes | Team / TBD | Pending |
| `/api/graviton/plan-d1` | Admin (Service Role) | No | Team / TBD | Pending (Uses ANON_KEY currently) |
| `/api/graviton/plan-d2` | Admin (Service Role) | No | Team / TBD | Pending |
| `/api/graviton/plan-d3` | Admin (Service Role) | No | Team / TBD | Pending |
| `/api/graviton/production-detail` | Server | Yes | Team / TBD | Pending |
| `/api/graviton/production-tasks` | Server | Yes | Team / TBD | Pending |
| `/api/healthz` | Public / None | No | Team / TBD | Pending |
| `/api/pizza/analytics` | Server | Yes | Team / TBD | Pending |
| `/api/pizza/calculate-distribution` | Admin (Service Role) | Yes | Team / TBD | Pending |
| `/api/pizza/confirm-distribution` | Admin (Service Role) | Yes | Team / TBD | Pending |
| `/api/pizza/create-order` | Server | Yes | Team / TBD | Pending |
| `/api/pizza/distribution/results` | Admin (Service Role) | Yes | Team / TBD | Pending |
| `/api/pizza/distribution/run` | Admin (Service Role) | Yes | Team / TBD | Pending |
| `/api/pizza/distribution/status` | Admin (Service Role) | Yes | Team / TBD | Pending |
| `/api/pizza/distribution-stats` | Admin (Service Role) | Yes | Team / TBD | Pending |
| `/api/pizza/order-plan` | Server | Yes | Team / TBD | Pending |
| `/api/pizza/orders` | Server | Yes | Team / TBD | Pending |
| `/api/pizza/production-detail` | Server | Yes | Team / TBD | Pending |
| `/api/pizza/shop-stats` | Server | Yes | Team / TBD | Pending |
| `/api/pizza/summary` | Server | Yes | Team / TBD | Pending |
| `/api/pizza/update-stock` | Required Auth | Yes | Team / TBD | Pending |
| `/api/proxy/webhook` | Webhook (Hardened Auth) | No | Team / TBD | Pending |
| `/api/send-order` | Server | Yes | Team / TBD | Pending |
