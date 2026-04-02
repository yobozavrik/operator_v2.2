# ADR-003: Poster2 Snapshot Storage Model

## Status
Accepted

## Context
The first operational requirement is to preserve factual store leftovers at a specific daily moment. Downstream systems will later need ERP, distribution, and production calculations based on reliable source data.

## Decision
Persist the first flow as a raw snapshot table:
- table: `categories_poster2.stock_snapshots`
- granularity: one ingredient, one storage, one business date
- key: `(snapshot_date, storage_id, ingredient_id)`
- raw Poster payload stored in `raw_payload`

## Consequences
Positive:
- factual balances remain reproducible
- downstream logic can be recalculated later
- snapshot ingestion stays idempotent through `upsert`

Negative:
- table stores denormalized raw payload for auditability
- additional storage footprint compared with aggregated facts only

## Rejected Alternatives
- storing only pre-aggregated daily totals
- writing leftovers directly into ERP/distribution tables
- using append-only duplicate rows without idempotent keys

