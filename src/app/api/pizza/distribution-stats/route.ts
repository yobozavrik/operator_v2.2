import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { fetchActivePizzaProductIds, fetchPizzaDistributionRowsByProduct } from '@/lib/pizza-distribution-read';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pizza/distribution-stats
 * Fetches distribution statistics from v_pizza_distribution_stats view
 */
export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabase = createServiceRoleClient();
        const { searchParams } = new URL(request.url);
        const parsedProductId = Number(searchParams.get('product_id'));
        const productIds = Number.isFinite(parsedProductId) && parsedProductId > 0
            ? [parsedProductId]
            : await fetchActivePizzaProductIds(supabase);

        const data = await fetchPizzaDistributionRowsByProduct(
            supabase,
            'product_id, product_name, spot_name, avg_sales_day, min_stock, stock_now, baked_at_factory, need_net',
            { productIds },
        );

        return NextResponse.json(data || []);
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
