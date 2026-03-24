require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POSTER_TOKEN = (process.env.POSTER_TOKEN || '').trim();
const POSTER_ACCOUNT = 'galia-baluvana34';

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

    const [posterProducts, catalogRes, weightRes] = await Promise.all([
        posterRequest('menu.getProducts'),
        supabase
            .schema('florida1')
            .from('production_180d_products')
            .select('product_id, product_name, unit, poster_weight_flag, category_id, category_name'),
        supabase.rpc(
            'exec_sql',
            {
                query: `
                    select
                        product_id,
                        product_name,
                        unit,
                        round(sum(avg_sales_day)::numeric, 2) as total_avg_sales_day,
                        sum(min_stock)::int as total_min_stock,
                        sum(stock_now)::int as total_stock_now,
                        sum(need_net)::int as total_need_net,
                        count(*)::int as stores
                    from florida1.v_florida_distribution_stats
                    where unit = 'кг'
                    group by product_id, product_name, unit
                    order by sum(avg_sales_day) desc
                    limit 5
                `.replace(/\s+/g, ' ').trim(),
            }
        ),
    ]);

    if (catalogRes.error) throw new Error(catalogRes.error.message);
    if (weightRes.error) throw new Error(weightRes.error.message);

    const posterById = new Map(
        posterProducts.map((row) => [
            Number(row.product_id),
            {
                product_name: String(row.product_name || '').trim(),
                poster_weight_flag: String(row.weight_flag || '') === '1',
                poster_unit: String(row.weight_flag || '') === '1' ? 'кг' : 'шт',
            },
        ])
    );

    const mismatches = [];
    for (const row of catalogRes.data || []) {
        const poster = posterById.get(Number(row.product_id));
        if (!poster) continue;

        const catalogUnit = String(row.unit || '').trim();
        const catalogWeightFlag = Boolean(row.poster_weight_flag);
        if (catalogUnit !== poster.poster_unit || catalogWeightFlag !== poster.poster_weight_flag) {
            mismatches.push({
                product_id: row.product_id,
                product_name: row.product_name,
                poster_weight_flag: poster.poster_weight_flag,
                poster_unit: poster.poster_unit,
                catalog_unit: catalogUnit,
                catalog_poster_weight_flag: catalogWeightFlag,
            });
        }
    }

    console.log(JSON.stringify({
        catalog_count: (catalogRes.data || []).length,
        mismatch_count: mismatches.length,
        mismatch_examples: mismatches.slice(0, 10),
        weight_samples: weightRes.data || [],
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
