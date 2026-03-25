-- Seed florida packaging config from C:\Users\dmytr\Downloads\ФЛОРИДА.csv
with src(product_name_snapshot, pack_weight_min_kg, pack_weight_max_kg, source_category) as (
  values
    ('Вареники ліниві солодкі', 0.5, 0.6, 'Вареники'),
    ('Вареники ліниві солоні', 0.5, 0.6, 'Вареники'),
    ('Банош з бринзою, шкварками та грибним соусом', 1, 1, 'Готові страви'),
    ('Бефстроганов з гречкою', 1, 1, 'Готові страви'),
    ('Бограч', 1, 1, 'Готові страви'),
    ('Гарбузовий крем-суп', 1, 1, 'Готові страви'),
    ('Жульєн', 1, 1, 'Готові страви'),
    ('Зелена гречка з курячим філе су-від', 1, 1, 'Готові страви'),
    ('Картопляне крем-пюре з пармезаном та КОТЛЕТАМИ зі свинини', 1, 1, 'Готові страви'),
    ('Картопляне крем-пюре з пармезаном та курячими фрикадельками', 1, 1, 'Готові страви'),
    ('Качина ніжка конфі із запеченим гарбузом та сирним мусом', 1, 1, 'Готові страви'),
    ('Куряче стегно в гостро-солодкому соусі з рисом у тайському стилі', 1, 1, 'Готові страви'),
    ('Локшина удон з куркою', 1, 1, 'Готові страви'),
    ('Паста Карбонара', 1, 1, 'Готові страви'),
    ('Паста Тоскана', 1, 1, 'Готові страви'),
    ('Рвана свинина та кускус з овочами', 1, 1, 'Готові страви'),
    ('Ребра BBQ з печеною картоплею', 1, 1, 'Готові страви'),
    ('Рибний галантин з овочами по-мексиканськи на рисовій подушці', 1, 1, 'Готові страви'),
    ('Сирний крем-суп', 1, 1, 'Готові страви'),
    ('Суп Рамен', 1, 1, 'Готові страви'),
    ('Том ям', 1, 1, 'Готові страви'),
    ('Філе хека з картопляним пюре', 1, 1, 'Готові страви'),
    ('Шпинатна паста з лососем', 1, 1, 'Готові страви'),
    ('Бедра курячі фаршировані', 0.5, 0.9, 'Ковбаси'),
    ('Паштет курячий', 0.4, 0.5, 'Ковбаси'),
    ('Скумбрія гриль з овочами', 0.8, 1.1, 'Ковбаси'),
    ('Скумбрія фарширована', 0.4, 0.5, 'Ковбаси'),
    ('Торт печінковий', 0.8, 1, 'Ковбаси'),
    ('Торт печінковий з плавленим сиром', 0.8, 1, 'Ковбаси'),
    ('Млинці з шинкою та голландським сиром', 0.6, 0.7, 'Млинці'),
    ('Млинці карамелізовані з яблуком', 0.5, 0.6, 'Млинці'),
    ('Млинці кукурудзяні з куркою', 0.5, 0.7, 'Млинці'),
    ('Гомбовці', 0.4, 0.5, 'Сирники'),
    ('Лаваш з куркою', 0.5, 0.6, 'Страви від шефа'),
    ('Лаваш з сиром', 0.5, 0.6, 'Страви від шефа'),
    ('Лаваш з тунцем', 0.5, 0.6, 'Страви від шефа'),
    ('Лаваш з шинкою та сиром', 0.5, 0.6, 'Страви від шефа'),
    ('Паштет "індичий"', 0.4, 0.5, 'Страви від шефа')
), matched as (
  select
    p.product_id,
    s.product_name_snapshot,
    s.pack_weight_min_kg::numeric(10,3) as pack_weight_min_kg,
    s.pack_weight_max_kg::numeric(10,3) as pack_weight_max_kg,
    (((s.pack_weight_min_kg + s.pack_weight_max_kg) / 2.0)::numeric(10,3)) as pack_weight_calc_kg,
    0.100::numeric(10,3) as pack_zero_threshold_kg,
    'ceil'::text as packs_rounding_mode,
    ('seed from ФЛОРИДА.csv; category=' || coalesce(nullif(trim(s.source_category), ''), '?'))::text as notes
  from src s
  join florida1.production_180d_products p
    on trim(p.product_name) = trim(s.product_name_snapshot)
  join categories.products cp
    on cp.id = p.product_id
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

-- Unmatched names check after migration:
-- Re-run this migration CTE as a standalone SELECT to inspect unmatched names:
-- select s.product_name_snapshot
-- from src s
-- left join florida1.production_180d_products p
--   on trim(p.product_name) = trim(s.product_name_snapshot)
-- where p.product_id is null;
