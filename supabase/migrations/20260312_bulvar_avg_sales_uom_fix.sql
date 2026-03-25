-- Fix avg_sales_day for Bulvar: mixed units (pieces vs grams)
-- Date: 2026-03-12

create or replace view bulvar1.v_bulvar_orders as
with bulvar_products as (
    select p.id as product_id,
           p.name as product_name
    from categories.products p
    join categories.categories c on p.category_id = c.category_id::text
    where c.category_name = any (array[
        'Страви від шефа'::text,
        'Хачапурі'::text,
        'Млинці'::text,
        'Котлети'::text,
        'Деруни'::text,
        'Сирники'::text,
        'Готові страви'::text,
        'Хінкалі'::text
    ])
),
shop_to_storage as (
    select s.spot_id,
           s.name as spot_name,
           st.storage_id
    from categories.spots s
    join categories.storages st
      on regexp_replace(lower(s.name), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text) =
         regexp_replace(replace(lower(st.storage_name), 'магазин'::text, ''::text), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text)
    where s.name !~~* '%test%'::text
      and s.name !~~* '%тест%'::text
),
product_uom_mode as (
    select p.product_id,
           case
             when percentile_disc(0.9) within group (order by ti.num) <= 10 then 'pieces'
             else 'grams'
           end as uom_mode
    from bulvar_products p
    left join categories.transaction_items ti
      on ti.product_id = p.product_id
    left join categories.transactions t
      on t.transaction_id = ti.transaction_id
     and t.date_close >= (current_date - interval '180 days')
     and t.date_close < current_date
    group by p.product_id
),
sales_14_days as (
    select t.spot_id,
           ti.product_id,
           sum(
             case
               when coalesce(pum.uom_mode, 'grams') = 'pieces'
                 then coalesce(ti.num, 0::numeric)
               else coalesce(ti.num, 0::numeric) / 1000.0
             end
           ) / 14.0 as avg_14d
    from categories.transactions t
    join categories.transaction_items ti
      on t.transaction_id = ti.transaction_id
    join bulvar_products p
      on p.product_id = ti.product_id
    left join product_uom_mode pum
      on pum.product_id = ti.product_id
    where t.date_close >= (current_date - interval '14 days')
      and t.date_close < current_date
    group by t.spot_id, ti.product_id
)
select m.spot_name as "назва_магазину",
       p.product_name as "назва_продукту",
       p.product_id as "код_продукту",
       round(coalesce(s14.avg_14d, 0::numeric), 2) as avg_sales_day,
       ceil(coalesce(s14.avg_14d, 0::numeric) * 1.5)::integer as min_stock
from shop_to_storage m
cross join bulvar_products p
left join sales_14_days s14
  on m.spot_id = s14.spot_id
 and p.product_id = s14.product_id;
