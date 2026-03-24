import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { syncPizzaLiveDataFromPoster } from '@/lib/pizza-live-sync';
import { Logger } from '@/lib/logger';

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
        await syncPizzaLiveDataFromPoster(supabase).catch((error) => {
            Logger.error('[pizza shop-stats] live sync failed', { error: String(error) });
            return null;
        });

        const { data, error } = await supabase
            .schema('pizza1')
            .from('v_pizza_distribution_stats')
            .select('spot_name, stock_now, min_stock, avg_sales_day')
            .eq('product_name', pizza);

        if (error) {
            console.error('Database Error:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
