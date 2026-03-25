-- Ensure Konditerka distribution stats expose spot/storage mapping used by API routes.
CREATE OR REPLACE VIEW konditerka1.v_konditerka_distribution_stats AS
SELECT
    vo."РєРѕРґ_РїСЂРѕРґСѓРєС‚Сѓ" AS product_id,
    vo."РЅР°Р·РІР°_РїСЂРѕРґСѓРєС‚Сѓ" AS product_name,
    s.spot_id::integer AS spot_id,
    vo."РЅР°Р·РІР°_РјР°РіР°Р·РёРЅСѓ" AS spot_name,
    st.storage_id::integer AS storage_id,
    vo.avg_sales_day,
    vo.min_stock,
    COALESCE(MAX(kl.count), 0)::integer AS stock_now,
    COALESCE(MAX(prod.baked_at_factory), 0)::integer AS baked_at_factory,
    GREATEST(0::numeric, (vo.min_stock::numeric - COALESCE(MAX(kl.count), 0)))::integer AS need_net
FROM konditerka1.v_konditerka_orders vo
LEFT JOIN konditerka1.v_konditerka_production_only prod
    ON vo."РєРѕРґ_РїСЂРѕРґСѓРєС‚Сѓ" = prod.product_id
LEFT JOIN categories.spots s
    ON s.name = vo."РЅР°Р·РІР°_РјР°РіР°Р·РёРЅСѓ"
LEFT JOIN categories.storages st
    ON regexp_replace(lower(s.name), '[^а-яієїa-z0-9]'::text, ''::text, 'g'::text)
     = regexp_replace(replace(lower(st.storage_name), 'магазин'::text, ''::text), '[^а-яієїa-z0-9]'::text, ''::text, 'g'::text)
LEFT JOIN konditerka1.leftovers kl
    ON st.storage_id = kl.storage_id
   AND vo."РєРѕРґ_РїСЂРѕРґСѓРєС‚Сѓ" = kl.product_id
GROUP BY
    vo."РєРѕРґ_РїСЂРѕРґСѓРєС‚Сѓ",
    vo."РЅР°Р·РІР°_РїСЂРѕРґСѓРєС‚Сѓ",
    s.spot_id,
    vo."РЅР°Р·РІР°_РјР°РіР°Р·РёРЅСѓ",
    st.storage_id,
    vo.avg_sales_day,
    vo.min_stock;
