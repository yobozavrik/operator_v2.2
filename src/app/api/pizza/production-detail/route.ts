import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { syncPizzaLiveDataFromPoster } from '@/lib/pizza-live-sync';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
const PIZZA_LIVE_SYNC_TIMEOUT_MS = 5000;

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabase = createServiceRoleClient();
        let liveRows: Array<{ product_name: string; baked_at_factory: number }> = [];

        try {
            const syncResult = await Promise.race([
                syncPizzaLiveDataFromPoster(supabase),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('sync timeout')), PIZZA_LIVE_SYNC_TIMEOUT_MS)
                ),
            ]);
            liveRows = syncResult.productionItems.map((item) => ({
                product_name: item.product_name,
                baked_at_factory: item.quantity,
            }));
        } catch (error) {
            Logger.error('[Pizza Production Detail] live sync failed', { error: String(error) });
        }

        const { data, error } = await supabase
            .schema('pizza1')
            .from('v_pizza_production_only')
            .select('product_name, baked_at_factory')
            .order('baked_at_factory', { ascending: false });

        if (error) {
            console.error('[Pizza Production Detail] Supabase error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const responseRows = liveRows.length > 0 ? liveRows : (data || []);
        responseRows.sort((a, b) => Number(b.baked_at_factory || 0) - Number(a.baked_at_factory || 0));

        return NextResponse.json(responseRows);
    } catch (error) {
        Logger.error('[Pizza Production Detail] Error', { error: String(error) });
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
