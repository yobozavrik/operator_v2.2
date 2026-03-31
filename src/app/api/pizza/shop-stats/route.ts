import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type ShopStatRow = {
    product_id: number;
    product_name: string | null;
    spot_name: string | null;
    stock_now: number | string | null;
    min_stock: number | string | null;
    avg_sales_day: number | string | null;
};

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const pizza = searchParams.get('pizza');

    if (!pizza) {
        return NextResponse.json({ error: 'Pizza name is required' }, { status: 400 });
    }

    try {
        const supabase = createServiceRoleClient();

        const { data, error } = await supabase
            .schema('pizza1')
            .from('v_pizza_distribution_stats')
            .select('product_id, product_name, spot_name, stock_now, min_stock, avg_sales_day')
            .eq('product_name', pizza.trim())
            .order('spot_name', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data || data.length === 0) {
            Logger.error('[pizza shop-stats] product not found in distribution rows', { error: pizza });
        }

        return NextResponse.json((data || []) as ShopStatRow[]);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
