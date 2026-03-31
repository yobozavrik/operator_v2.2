import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/branch-api';
import { fetchPizzaDistributionRowsByProduct, serializeRouteError } from '@/lib/pizza-distribution-read';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabase = createServiceRoleClient();
        const data = await fetchPizzaDistributionRowsByProduct(
            supabase,
            'product_id, product_name, spot_name, stock_now, min_stock, avg_sales_day, need_net, baked_at_factory',
        );

        Logger.info('[pizza Orders API] rows loaded', { meta: { count: data?.length || 0 } });
        return NextResponse.json(data || []);
    } catch (err) {
        const message = serializeRouteError(err);
        Logger.error('[pizza Orders API] critical error', { error: message });
        return NextResponse.json({ error: 'Internal Server Error', message }, { status: 500 });
    }
}
