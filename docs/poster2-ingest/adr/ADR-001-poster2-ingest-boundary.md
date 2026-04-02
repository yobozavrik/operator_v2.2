# ADR-001: Poster2 Ingest Boundary

## Status
Accepted

## Context
The second Poster account must be integrated into Supabase without coupling ingest logic to the main application repository or its UI release cycle. The contour starts with daily stock snapshots and is expected to grow into a broader ingestion surface.

## Decision
Create a dedicated integration contour named `poster2-ingest` with:
- its own documentation package
- self-hosted Supabase Edge Functions runtime under Coolify
- SQL scheduling through `pg_cron`
- data landing zone in schema `categories_poster2`

## Consequences
Positive:
- integration logic is isolated from UI changes
- scheduling and external API risks are contained
- migration to the main repository is explicit and documented

Negative:
- additional operational surface in Coolify
- duplicated deployment concerns until the final transfer

## Rejected Alternatives
- embedding Poster2 ingestion directly into the Next.js UI project
- relying on MCP tooling for scheduled production ingestion
- storing snapshot logic only as manual scripts without runtime ownership

