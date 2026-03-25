import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { syncBranchProductionFromPoster } from '@/lib/branch-production-sync';
import { syncBulvarCatalogFromPoster } from '@/lib/bulvar-catalog';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        let liveTotalBaked: number | null = null;
        try {
            const serviceClient = createServiceRoleClient();
            const syncResult = await Promise.race([
                (async () => {
                    await syncBulvarCatalogFromPoster(serviceClient);
                    return syncBranchProductionFromPoster(serviceClient, 'bulvar1', 22);
                })(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('sync timeout')), 2500)
                ),
            ]);
            liveTotalBaked = syncResult.totalQty;
        } catch {
            // Fallback to DB summary values if live Poster sync is unavailable.
        }

        const { data, error } = await supabase
            .schema('bulvar1')
            .from('v_bulvar_summary_stats')
            .select('total_baked, total_stock, total_norm, total_need, fill_index')
            .single();

        if (error) {
            console.error('[bulvar Summary] Supabase error:', error);
            // Return 0 values to prevent frontend crash
            return NextResponse.json({
                total_baked: 0,
                total_stock: 0,
                total_norm: 0,
                total_need: 0,
                fill_index: 0,
            });
        }

        return NextResponse.json(
            {
                ...(data || {
                    total_baked: 0,
                    total_stock: 0,
                    total_norm: 0,
                    total_need: 0,
                    fill_index: 0,
                }),
                total_baked: liveTotalBaked ?? Number(data?.total_baked || 0),
            },
            { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } }
        );
    } catch (error) {
        console.error('[bulvar Summary] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
