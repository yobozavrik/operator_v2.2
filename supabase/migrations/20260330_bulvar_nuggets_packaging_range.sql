with target_products as (
    select
        p.id as product_id,
        p.name as product_name
    from categories.products p
    where lower(coalesce(p.name, '')) like '%нагет%'
      and lower(coalesce(p.name, '')) like '%куряч%'
),
upsert_rows as (
    select
        tp.product_id,
        tp.product_name as product_name_snapshot,
        true as is_active,
        0.400::numeric(10,3) as pack_weight_min_kg,
        0.450::numeric(10,3) as pack_weight_max_kg,
        0.425::numeric(10,3) as pack_weight_calc_kg,
        0.100::numeric(10,3) as pack_zero_threshold_kg,
        'ceil'::text as packs_rounding_mode,
        'Updated nuggets packaging range to 0.400-0.450 kg'::text as notes
    from target_products tp
)
insert into bulvar1.product_packaging_config (
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
    is_active,
    pack_weight_min_kg,
    pack_weight_max_kg,
    pack_weight_calc_kg,
    pack_zero_threshold_kg,
    packs_rounding_mode,
    notes
from upsert_rows
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
