import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { fetchFloridaProduction180dRows, FloridaProduction180dRow } from '@/lib/florida-production-180d';

export const dynamic = 'force-dynamic';

const ALLOWED_SORT_COLUMNS = new Set([
    'product_id',
    'product_name',
    'total_qty_180d',
    'prod_days',
    'avg_qty_per_prod_day',
    'avg_qty_per_calendar_day',
    'min_day_qty',
    'max_day_qty',
    'network_min_stock',
    'network_avg_sales_day',
    'network_stock_now',
    'shops_count',
    'last_manufacture_at',
    'source_storage_id',
    'refreshed_at',
    'updated_at',
]);

function compareRows(
    a: FloridaProduction180dRow,
    b: FloridaProduction180dRow,
    sort: string,
    ascending: boolean
) {
    let result = 0;
    const left = a[sort as keyof FloridaProduction180dRow];
    const right = b[sort as keyof FloridaProduction180dRow];

    if (sort === 'product_name') {
        result = String(left || '').localeCompare(String(right || ''));
    } else if (sort === 'last_manufacture_at' || sort === 'refreshed_at') {
        const leftTs = left ? new Date(String(left)).getTime() : 0;
        const rightTs = right ? new Date(String(right)).getTime() : 0;
        result = leftTs - rightTs;
    } else {
        result = Number(left || 0) - Number(right || 0);
    }

    return ascending ? result : -result;
}

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || '';

        const sortRaw = searchParams.get('sort') || 'total_qty_180d';
        const orderRaw = searchParams.get('order') || 'desc';
        const limitRaw = parseInt(searchParams.get('limit') || '50', 10);
        const offsetRaw = parseInt(searchParams.get('offset') || '0', 10);

        const sort = ALLOWED_SORT_COLUMNS.has(sortRaw) ? sortRaw : 'total_qty_180d';
        const ascending = orderRaw === 'asc';
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 50;
        const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json(
                { error: 'Server Config Error', code: 'MISSING_SUPABASE_CONFIG' },
                { status: 500 }
            );
        }

        const supabase = createSupabaseClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false },
        });

        let rows = await fetchFloridaProduction180dRows(supabase);
        if (search) {
            const searchLower = search.toLowerCase();
            rows = rows.filter((row) => row.product_name.toLowerCase().includes(searchLower));
        }

        rows.sort((a, b) => compareRows(a, b, sort, ascending));

        const paginatedRows = rows.slice(offset, offset + limit);
        const lastUpdate = rows
            .map((row) => row.refreshed_at || row.last_manufacture_at)
            .filter(Boolean)
            .sort()
            .at(-1) || null;

        return NextResponse.json({
            rows: paginatedRows,
            meta: {
                products_count: rows.length,
                last_update: lastUpdate,
            },
        });
    } catch (err: any) {
        Logger.error('[florida Production 180d] Critical Error', { error: err.message });
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: err.message,
                code: 'INTERNAL_ERROR',
            },
            { status: 500 }
        );
    }
}
