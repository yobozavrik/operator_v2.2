import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { syncPizzaLiveDataFromPoster } from '@/lib/pizza-live-sync';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabase = createServiceRoleClient();
        let liveTotalBaked: number | null = null;

        try {
            const syncResult = await syncPizzaLiveDataFromPoster(supabase);
            liveTotalBaked = syncResult.totalProductionQty;
        } catch (error) {
            Logger.error('[Pizza Summary] live sync failed', { error: String(error) });
        }

        const { data, error } = await supabase
            .schema('pizza1')
            .from('v_pizza_summary_stats')
            .select('total_baked, total_norm, total_need')
            .single();

        if (error) {
            console.error('[Pizza Summary] Supabase error:', error);
            // Return 0 values to prevent frontend crash
            return NextResponse.json({ total_baked: 0, total_norm: 0, total_need: 0 });
        }

        return NextResponse.json({
            ...(data || { total_baked: 0, total_norm: 0, total_need: 0 }),
            total_baked: liveTotalBaked ?? Number(data?.total_baked || 0),
        });
    } catch (error) {
        console.error('[Pizza Summary] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
