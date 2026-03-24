require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POSTER_TOKEN = (process.env.POSTER_TOKEN || '').trim();
const POSTER_ACCOUNT = 'galia-baluvana34';

const FLORIDA_CATEGORIES = [
    'Вареники',
    'Верховода',
    'Голубці',
    'Готові страви',
    'Деруни',
    'Зрази',
    'Ковбаси',
    'Котлети',
    'Млинці',
    'Моті',
    'Пельмені',
    'Перець фарширований',
    'ПИРІЖЕЧКИ',
    'Сирники',
    'Страви від шефа',
    'Хачапурі',
    'Хінкалі',
    'Чебуреки',
];

function quote(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function resolveUnit(weightFlag) {
    return String(weightFlag || '') === '1' ? 'кг' : 'шт';
}

async function posterRequest(method, params = {}) {
    if (!POSTER_TOKEN) {
        throw new Error('POSTER_TOKEN environment variable is missing.');
    }

    const url = new URL(`https://${POSTER_ACCOUNT}.joinposter.com/api/${method}`);
    url.searchParams.append('token', POSTER_TOKEN);

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.append(key, String(value));
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`Poster API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(`Poster API error response: ${data.error}`);
    }

    return data.response || [];
}

async function main() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });

    const categoriesSql = FLORIDA_CATEGORIES.map(quote).join(',');
    const keepIdsSql = `
        with prod_180d as (
            select distinct mi.product_id::int as product_id
            from categories.manufacture_items mi
            join categories.manufactures m on m.manufacture_id = mi.manufacture_id
            join categories.products p on p.id = mi.product_id
            join categories.categories c on c.category_id = p.category_id
            where m.storage_id = 41
              and m.manufacture_date >= ((now() at time zone 'Europe/Kyiv')::date - interval '180 days')
              and m.manufacture_date < (((now() at time zone 'Europe/Kyiv')::date) + interval '1 day')
              and mi.is_deleted is not true
              and c.category_name = any (array[${categoriesSql}]::text[])
        ),
        prod_live as (
            select distinct product_id::int as product_id
            from florida1.v_florida_production_only
        )
        select distinct product_id
        from (
            select product_id from prod_180d
            union
            select product_id from prod_live
        ) u
        order by product_id
    `.replace(/\s+/g, ' ').trim();

    const keepIdsRes = await supabase.rpc('exec_sql', { query: keepIdsSql });
    if (keepIdsRes.error) {
        throw new Error(keepIdsRes.error.message);
    }

    const keepIds = new Set(
        (keepIdsRes.data || [])
            .map((row) => Number(row.product_id))
            .filter((id) => Number.isFinite(id) && id > 0)
    );

    const currentRes = await supabase
        .schema('florida1')
        .from('production_180d_products')
        .select('product_id, product_name, source_storage_id');
    if (currentRes.error) {
        throw new Error(currentRes.error.message);
    }

    const currentRows = currentRes.data || [];
    const extraIds = currentRows
        .filter((row) => Number(row.source_storage_id) === 41)
        .map((row) => Number(row.product_id))
        .filter((id) => Number.isFinite(id) && id > 0 && !keepIds.has(id));

    if (extraIds.length > 0) {
        const { error: deleteError } = await supabase
            .schema('florida1')
            .from('production_180d_products')
            .delete()
            .in('product_id', extraIds);

        if (deleteError) {
            throw new Error(deleteError.message);
        }
    }

    const posterProducts = await posterRequest('menu.getProducts');
    const nowIso = new Date().toISOString();
    const payload = posterProducts
        .map((row) => ({
            product_id: Number(row.product_id),
            product_name: String(row.product_name || '').trim(),
            category_id: Number(row.menu_category_id),
            category_name: String(row.category_name || '').trim(),
            unit: resolveUnit(row.weight_flag),
            poster_weight_flag: String(row.weight_flag || '') === '1',
            source_storage_id: 41,
            refreshed_at: nowIso,
            updated_at: nowIso,
        }))
        .filter((row) => keepIds.has(row.product_id))
        .filter((row) => Number.isFinite(row.product_id) && row.product_id > 0 && row.product_name);

    if (payload.length > 0) {
        const { error: upsertError } = await supabase
            .schema('florida1')
            .from('production_180d_products')
            .upsert(payload, { onConflict: 'product_id' });

        if (upsertError) {
            throw new Error(upsertError.message);
        }
    }

    const recalcRes = await supabase.schema('florida1').rpc('fn_full_recalculate_all');
    if (recalcRes.error) {
        throw new Error(recalcRes.error.message);
    }

    console.log(JSON.stringify({
        keep_count: keepIds.size,
        removed_count: extraIds.length,
        upserted_count: payload.length,
        recalc_batch: recalcRes.data,
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
