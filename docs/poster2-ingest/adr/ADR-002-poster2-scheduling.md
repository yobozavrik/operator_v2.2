# ADR-002: Poster2 Scheduling Strategy

## Status
Accepted

## Context
The business requirement is a stock snapshot every day at `06:00` local Chisinau time. PostgreSQL and `pg_cron` operate in `UTC`, and direct `06:00 UTC` scheduling would not represent the business boundary.

## Decision
Use an hourly cron trigger:
- cron expression: `0 * * * *`
- function-level guard checks local time in `Europe/Chisinau`
- write occurs only when the computed local hour equals `06`
- manual override is possible with `force=true`

## Consequences
Positive:
- daylight saving changes do not break the business schedule
- cron remains simple and stable
- operational forcing remains available

Negative:
- function receives hourly invocations and returns skipped responses most of the day

## Rejected Alternatives
- direct `06:00 UTC` cron schedule
- multiple seasonal cron definitions
- local OS cron outside the Supabase scheduling layer

