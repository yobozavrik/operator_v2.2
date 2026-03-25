-- Fill unmatched Florida packaging rows that are present in categories.products but absent in production_180d_products.
with src(product_name_snapshot, pack_weight_min_kg, pack_weight_max_kg, source_category) as (
  values
    ('Скумбрія гриль з овочами', 0.8, 1.1, 'Ковбаси')
), matched as (
  select
    cp.id as product_id,
    s.product_name_snapshot,
    s.pack_weight_min_kg::numeric(10,3) as pack_weight_min_kg,
    s.pack_weight_max_kg::numeric(10,3) as pack_weight_max_kg,
    (((s.pack_weight_min_kg + s.pack_weight_max_kg) / 2.0)::numeric(10,3)) as pack_weight_calc_kg,
    0.100::numeric(10,3) as pack_zero_threshold_kg,
    'ceil'::text as packs_rounding_mode,
    ('seed from ФЛОРИДА.csv (catalog fallback); category=' || coalesce(nullif(trim(s.source_category), ''), '?'))::text as notes
  from src s
  join categories.products cp
    on trim(cp.name) = trim(s.product_name_snapshot)
)
insert into florida1.product_packaging_config (
  product_id,
  product_name_snapshot,
  is_active,
  pack_weight_min_kg,
  pack_weight_max_kg,
  pack_weight_calc_kg,
  pack_zero_threshold_kg,
  packs_rounding_mode,
  notes
)
select
  product_id,
  product_name_snapshot,
  true as is_active,
  pack_weight_min_kg,
  pack_weight_max_kg,
  pack_weight_calc_kg,
  pack_zero_threshold_kg,
  packs_rounding_mode,
  notes
from matched
on conflict (product_id) do update
set
  product_name_snapshot = excluded.product_name_snapshot,
  is_active = excluded.is_active,
  pack_weight_min_kg = excluded.pack_weight_min_kg,
  pack_weight_max_kg = excluded.pack_weight_max_kg,
  pack_weight_calc_kg = excluded.pack_weight_calc_kg,
  pack_zero_threshold_kg = excluded.pack_zero_threshold_kg,
  packs_rounding_mode = excluded.packs_rounding_mode,
  notes = excluded.notes,
  updated_at = now();
