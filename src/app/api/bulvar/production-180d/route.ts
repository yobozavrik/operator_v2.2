import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const ALLOWED_SORT_COLUMNS = new Set([
    'product_id',
    'product_name',
    'total_qty_180d',
    'prod_days',
    'avg_qty_per_prod_day',
    'network_min_stock',
    'network_avg_sales_day',
    'network_stock_now',
    'shops_count',
    'last_manufacture_at',
    'updated_at',
    'refreshed_at',
]);

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
        const order = orderRaw === 'asc' ? 'asc' : 'desc';
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

        const { error: refreshError } = await supabase
            .schema('bulvar1')
            .rpc('refresh_production_180d_products', { p_product_ids: null });

        if (refreshError) {
            Logger.error('[bulvar Production 180d] refresh function error', { error: refreshError.message });
        }

        let query = supabase
            .schema('bulvar1')
            .from('production_180d_products')
            .select('*', { count: 'exact' });

        if (search) {
            query = query.ilike('product_name', `%${search}%`);
        }

        query = query.order(sort, { ascending: order === 'asc' })
            .range(offset, offset + limit - 1);

        const [{ data, error, count }, { data: latestRow, error: latestErr }] = await Promise.all([
            query,
            supabase
                .schema('bulvar1')
                .from('production_180d_products')
                .select('refreshed_at, updated_at')
                .order('refreshed_at', { ascending: false })
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle()
        ]);

        if (error) {
            Logger.error('[bulvar Production 180d] Supabase error', { error: error.message });
            return NextResponse.json({ error: error.message, code: 'DB_ERROR' }, { status: 500 });
        }

        if (latestErr) {
            Logger.error('[bulvar Production 180d] latest timestamp query error', { error: latestErr.message });
        }

        const lastUpdate = latestRow?.refreshed_at || latestRow?.updated_at || null;

        return NextResponse.json({
            rows: data || [],
            meta: {
                products_count: count || 0,
                last_update: lastUpdate
            }
        });

    } catch (err: any) {
        Logger.error('[bulvar Production 180d] Critical Error', { error: err.message });
        return NextResponse.json({
            error: 'Internal Server Error',
            message: err.message,
            code: 'INTERNAL_ERROR'
        }, { status: 500 });
    }
}
