# ADR-004: Poster2 Daily Sync Strategy

## Status
Accepted

## Context
The initial requirement is to populate `categories_poster2` comprehensively while keeping the operational model simple. The most critical fact is the 06:00 stock snapshot, but the rest of the schema must also be refreshed regularly from Poster where the account allows it.

## Decision
Keep two separate functions:
- `poster2-stock-snapshot` for the 06:00 balance snapshot
- `poster2-sync-daily` for daily reference, fact, and derived sales refresh

Daily sync behavior:
- cron expression: `15 * * * *`
- function-level guard: execute only when local `Europe/Chisinau` hour is `06`
- default date window: previous business day
- explicit `dateFrom/dateTo` allowed for manual backfill

## Consequences
Positive:
- stock snapshot stays isolated from heavier sync logic
- daily sync remains simple enough to debug
- reference tables and derived sales can evolve independently from snapshot logic

Negative:
- some tables remain deferred because the current Poster account does not expose the required endpoints
- transaction line completeness depends on `dash.getTransactionProducts`

## Rejected Alternatives
- one giant function for both snapshot and daily sync
- many separate cron jobs at the first rollout stage
- near-real-time transaction sync before the daily ingest foundation is stable
