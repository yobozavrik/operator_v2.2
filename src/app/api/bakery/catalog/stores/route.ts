import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { coercePositiveInt } from '@/lib/branch-api';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SKU_ID_RE = /^\d{1,10}$/;

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const startDateParam = searchParams.get('start_date');
        const endDateParam = searchParams.get('end_date');
        const days = coercePositiveInt(searchParams.get('days'), 7, 1, 365);
        const skuId = searchParams.get('sku_id');

        if (!skuId) {
            return NextResponse.json({ error: 'Missing sku_id parameter' }, { status: 400 });
        }
        if (!SKU_ID_RE.test(skuId)) {
            return NextResponse.json({ error: 'Invalid sku_id, must be a positive integer' }, { status: 400 });
        }
        if (startDateParam && !DATE_RE.test(startDateParam)) {
            return NextResponse.json({ error: 'Invalid start_date format, expected YYYY-MM-DD' }, { status: 400 });
        }
        if (endDateParam && !DATE_RE.test(endDateParam)) {
            return NextResponse.json({ error: 'Invalid end_date format, expected YYYY-MM-DD' }, { status: 400 });
        }

        let p_start_date: string;
        let p_end_date: string;

        if (startDateParam && endDateParam) {
            p_start_date = startDateParam;
            p_end_date = endDateParam;
        } else {
            const endDate = new Date();
            const startDate = new Date();
            endDate.setDate(endDate.getDate() - 1);
            startDate.setDate(endDate.getDate() - (days - 1));

            p_start_date = startDate.toISOString().split('T')[0];
            p_end_date = endDate.toISOString().split('T')[0];
        }

        const { createClient: createSupabaseJSClient } = await import('@supabase/supabase-js');
        const supabase = createSupabaseJSClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: stores, error } = await supabase.rpc('f_craft_get_sku_stores', {
            p_sku_id: skuId,
            p_start_date, p_end_date
        });

        if (error) {
            Logger.error('RPC Error f_craft_get_sku_stores', { error: error.message });
            throw new Error(`catalog_stores: ${error.message}`);
        }

        return NextResponse.json({
            stores: stores || [],
            params: { p_sku_id: skuId, p_days: days }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        Logger.error('Critical Bakery Catalog Stores API Error', { error: err.message || String(err) });
        return NextResponse.json({
            error: 'Internal Server Error',
            message: err.message
        }, { status: 500 });
    }
}
