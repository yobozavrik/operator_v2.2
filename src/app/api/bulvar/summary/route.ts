import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabase = createServiceRoleClient();

        const [{ data: summaryData, error: summaryError }, { data: statRows, error: statsError }] = await Promise.all([
            supabase
                .schema('bulvar1')
                .from('v_bulvar_summary_stats')
                .select('total_baked')
                .single(),
            supabase
                .schema('bulvar1')
                .from('v_bulvar_distribution_stats_x3')
                .select('min_stock, stock_now, need_net'),
        ]);

        if (summaryError || statsError) {
            console.error('[bulvar Summary] Supabase error:', summaryError || statsError);
            return NextResponse.json({ total_baked: 0, total_norm: 0, total_need: 0 });
        }

        const adjusted = (statRows || []).reduce(
            (acc, row: any) => {
                const min = Math.max(0, Number(row.min_stock) || 0);
                const need = Math.max(0, Number(row.need_net) || Math.max(0, min - Math.max(0, Number(row.stock_now) || 0)));

                acc.total_norm += min;
                acc.total_need += need;
                return acc;
            },
            { total_norm: 0, total_need: 0 }
        );

        return NextResponse.json({
            total_baked: Number(summaryData?.total_baked) || 0,
            total_norm: adjusted.total_norm,
            total_need: adjusted.total_need,
        });
    } catch (error) {
        console.error('[bulvar Summary] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
