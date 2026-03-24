require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POSTER_TOKEN = (process.env.POSTER_TOKEN || '').trim();
const POSTER_ACCOUNT = 'galia-baluvana34';
const BULVAR_CATEGORY_IDS = new Set(['8', '10', '11', '12', '14', '29', '30', '40']);

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

    const products = await posterRequest('menu.getProducts');
    const nowIso = new Date().toISOString();
    const payload = products
        .filter((row) => BULVAR_CATEGORY_IDS.has(String(row.menu_category_id || '')))
        .map((row) => ({
            product_id: Number(row.product_id),
            product_name: String(row.product_name || '').trim(),
            category_id: Number(row.menu_category_id),
            category_name: String(row.category_name || '').trim(),
            unit: resolveUnit(row.weight_flag),
            poster_weight_flag: String(row.weight_flag || '') === '1',
            source_storage_id: 22,
            refreshed_at: nowIso,
            updated_at: nowIso,
        }))
        .filter((row) => Number.isFinite(row.product_id) && row.product_id > 0 && row.product_name);

    const { error } = await supabase
        .schema('bulvar1')
        .from('production_180d_products')
        .upsert(payload, { onConflict: 'product_id' });

    if (error) {
        throw new Error(error.message);
    }

    const summary = payload.reduce(
        (acc, row) => {
            if (row.unit === 'шт') acc.pieces += 1;
            if (row.unit === 'кг') acc.weight += 1;
            return acc;
        },
        { total: payload.length, pieces: 0, weight: 0 }
    );

    console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
