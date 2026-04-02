# Operations: Poster2 Stock Snapshot

## Implemented Flow
The current production flow captures daily leftovers from Poster account `pekarnia16` for storage `1`.

## Runtime Dependencies
- self-hosted Supabase deployed via Coolify
- functions runtime enabled
- PostgreSQL extensions: `pg_cron`, `pg_net`
- schema `categories_poster2`
- table `categories_poster2.stock_snapshots`

## Edge Function
- name: `poster2-stock-snapshot`
- runtime path: `volumes/functions/poster2-stock-snapshot/index.ts` in the self-hosted Supabase stack
- invocation path: `/functions/v1/poster2-stock-snapshot`
- Coolify persistent source: `/data/coolify/services/ako4swc0cg4gkw0gssocscos/volumes/functions/poster2-stock-snapshot/index.ts`
- runtime mount inside container: `/home/deno/functions/poster2-stock-snapshot/index.ts`

Additional function:
- name: `poster2-sync-daily`
- runtime path: `volumes/functions/poster2-sync-daily/index.ts`
- invocation path: `/functions/v1/poster2-sync-daily`
- Coolify persistent source: `/data/coolify/services/ako4swc0cg4gkw0gssocscos/volumes/functions/poster2-sync-daily/index.ts`
- runtime mount inside container: `/home/deno/functions/poster2-sync-daily/index.ts`

## Runtime Routing
The self-hosted deployment does not rely on cloud-style deploy commands.

Observed runtime behavior:
- `main/index.ts` is the HTTP entrypoint for the edge-runtime container
- request path `/functions/v1/poster2-stock-snapshot` is routed to service name `poster2-stock-snapshot`
- request path `/functions/v1/poster2-sync-daily` is routed to service name `poster2-sync-daily`
- the runtime then resolves `/home/deno/functions/poster2-stock-snapshot`
- the runtime then resolves `/home/deno/functions/poster2-sync-daily`

Implication:
- creating a folder only inside the running container is not enough
- function code must exist in the Coolify persistent volume before restart

## Required Environment Variables
If secrets are externalized:
- `POSTER2_ACCOUNT`
- `POSTER2_TOKEN`
- `POSTER2_STORAGE_ID`
- `POSTER2_SCHEMA`

Runtime-provided variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## REST Exposure Requirement
Because the function writes through `supabase-js`, persistence goes through PostgREST rather than a direct database socket.

Mandatory configuration:
- `supabase-rest` environment variable `PGRST_DB_SCHEMAS` must include `categories_poster2`

Confirmed working value:
```text
public,storage,graphql_public,graviton,ml_forecasting,categories,bakery1,pirozhki,production,konditerka1,florida1,bulvar1,pizza1,executive,market_intel,leftovers,sadova1,shveyka,categories_poster2
```

Failure mode if omitted:
- Edge Function returns HTTP `500`
- error text: schema is not in the allowed PostgREST schema list

## Schedule
- database timezone: `UTC`
- business timezone: `Europe/Chisinau`
- cron expression: `0 * * * *`
- actual write window: local hour equals `06`
- daily sync cron expression: `15 * * * *`
- daily sync default date window: previous business day in `Europe/Chisinau`

## Why Hourly Cron Is Used
If cron were scheduled directly at `06:00 UTC`, business time would drift relative to Chisinau. Hourly trigger with function-side guard preserves the local-time invariant even when daylight saving rules change.

## Manual Health Checks
1. Check cron registration:
```sql
select jobid, jobname, schedule, command
from cron.job
where jobname = 'poster2-stock-snapshot-hourly';
```

2. Check latest stored snapshot:
```sql
select snapshot_date, storage_id, count(*) as rows_count, max(snapshot_at) as latest_snapshot_at
from categories_poster2.stock_snapshots
group by snapshot_date, storage_id
order by snapshot_date desc, storage_id desc
limit 10;
```

3. Check detailed rows for the latest business day:
```sql
select *
from categories_poster2.stock_snapshots
where snapshot_date = (
    select max(snapshot_date) from categories_poster2.stock_snapshots
)
order by ingredient_name
limit 50;
```

4. Check latest successful manual verification:
```sql
select snapshot_date, storage_id, count(*) as rows_count, max(snapshot_at) as latest_snapshot_at
from categories_poster2.stock_snapshots
where snapshot_date = '2026-03-30'
group by snapshot_date, storage_id;
```

Expected reference result from first production validation:
- `snapshot_date = 2026-03-30`
- `storage_id = 1`
- `rows_count = 621`

5. Check latest daily sync facts:
```sql
select count(*) as transactions_count
from categories_poster2.transactions;
```

6. Check latest daily sync manufactures:
```sql
select count(*) as manufacture_headers, max(manufacture_date) as latest_manufacture_at
from categories_poster2.manufactures;
```

## Operational Risks
- Poster token rotation breaks the function immediately.
- Missing function restart in Coolify leaves cron pointing to a non-updated runtime.
- If `verify_jwt` stays enabled for the function, `pg_cron` calls will be rejected.
- If `PGRST_DB_SCHEMAS` omits `categories_poster2`, writes fail although the function itself can still call Poster successfully.
- Writing code only inside the running `edge-runtime` container is non-persistent and will be lost on restart.
- Hardcoded token in function code is acceptable only as a temporary bootstrap path.
- Poster account `pekarnia16` currently does not expose client groups, write-offs, or movements via the tested endpoints.
- `dash.getTransactionProducts` may return no rows even when `dash.getTransactions` returns headers, so sales-line completeness must be monitored.

## Recommended Next Operational Steps
- move Poster token from hardcoded code into runtime env
- document the `supabase-rest` schema allowlist in infrastructure runbooks
- add structured logs for start, skip, success, and failure
- add alerting for repeated failures
- deploy and validate `poster2-sync-daily`
- decide whether unsupported tables should stay empty or be backfilled from alternate data sources
