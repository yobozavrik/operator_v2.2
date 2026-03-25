import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { fetchKonditerkaTodayProduction } from '@/lib/konditerka-production-source';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        // Query the dedicated summary view
        const { data, error } = await supabase
            .schema('konditerka1').from('v_konditerka_summary_stats')
            .select('total_baked, total_norm, total_need')
            .single();

        if (error) {
            console.error('[Konditerka Summary] Supabase error:', error);
            // Return 0 values to prevent frontend crash
            return NextResponse.json({ total_baked: 0, total_norm: 0, total_need: 0 });
        }

        const cacheHeaders = { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' };
        const summary = data || { total_baked: 0, total_norm: 0, total_need: 0 };
        const totalBaked = Number(summary.total_baked) || 0;
        if (totalBaked > 0 || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return NextResponse.json(summary, { headers: cacheHeaders });
        }

        const supabaseAdmin = createServiceRoleClient();
        let fallbackTotal = 0;
        try {
            const fallbackRows = await fetchKonditerkaTodayProduction(supabaseAdmin);
            fallbackTotal = fallbackRows.reduce((sum, row) => sum + (Number(row.baked_at_factory) || 0), 0);
        } catch (fallbackError) {
            console.warn('[Konditerka Summary] production fallback failed:', fallbackError);
        }

        return NextResponse.json(
            { ...summary, total_baked: Math.round(fallbackTotal) },
            { headers: cacheHeaders }
        );
    } catch (error) {
        console.error('[Konditerka Summary] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
