import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { syncBranchProductionFromPoster } from '@/lib/branch-production-sync';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        let liveTotalBaked: number | null = null;
        try {
            const serviceClient = createServiceRoleClient();
            const syncResult = await syncBranchProductionFromPoster(serviceClient, 'florida1', 41);
            liveTotalBaked = syncResult.totalQty;
        } catch {
            // Keep summary endpoint resilient: fallback to DB view result.
        }

        // Query the dedicated summary view
        const { data, error } = await supabase
            .schema('florida1').from('v_florida_summary_stats')
            .select('total_baked, total_norm, total_need')
            .single();

        if (error) {
            console.error('[Florida Summary] Supabase error:', error);
            // Return 0 values to prevent frontend crash
            return NextResponse.json({ total_baked: 0, total_norm: 0, total_need: 0 });
        }

        return NextResponse.json({
            ...(data || { total_baked: 0, total_norm: 0, total_need: 0 }),
            total_baked: liveTotalBaked ?? Number(data?.total_baked || 0),
        });
    } catch (error) {
        console.error('[Florida Summary] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
