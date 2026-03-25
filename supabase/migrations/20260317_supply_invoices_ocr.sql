create table if not exists executive.supply_invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'needs_review', 'posted', 'failed')),
  source_filename text,
  source_mime_type text,
  source text not null default 'upload' check (source in ('camera', 'upload')),
  invoice_number text,
  invoice_date date,
  supplier_name text,
  total_amount numeric(14, 2),
  currency text not null default 'UAH',
  confidence numeric(5, 4),
  raw_text text,
  ocr_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  review_notes text,
  error_message text
);

create index if not exists idx_supply_invoices_created_at
  on executive.supply_invoices (created_at desc);

create index if not exists idx_supply_invoices_status
  on executive.supply_invoices (status);

create index if not exists idx_supply_invoices_invoice_date
  on executive.supply_invoices (invoice_date desc);

create or replace function executive.set_supply_invoices_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_supply_invoices_updated_at on executive.supply_invoices;
create trigger trg_supply_invoices_updated_at
before update on executive.supply_invoices
for each row
execute function executive.set_supply_invoices_updated_at();

alter table executive.supply_invoices enable row level security;

drop policy if exists supply_invoices_select_authenticated on executive.supply_invoices;
create policy supply_invoices_select_authenticated
on executive.supply_invoices
for select
to authenticated
using (true);

drop policy if exists supply_invoices_insert_authenticated on executive.supply_invoices;
create policy supply_invoices_insert_authenticated
on executive.supply_invoices
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists supply_invoices_update_authenticated on executive.supply_invoices;
create policy supply_invoices_update_authenticated
on executive.supply_invoices
for update
to authenticated
using (true)
with check (true);
