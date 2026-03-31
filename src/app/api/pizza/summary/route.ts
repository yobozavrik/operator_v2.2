import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { Logger } from '@/lib/logger';
import { fetchPizzaDistributionRowsByProduct, serializeRouteError } from '@/lib/pizza-distribution-read';

export const dynamic = 'force-dynamic';

const PIZZA_NORM_MULTIPLIER = 2;

type SummaryStatsRow = {
    product_name?: string | null;
    min_stock?: number | string | null;
    need_net?: number | string | null;
    baked_at_factory?: number | string | null;
};

function safeNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').replace(/[^0-9.-]/g, '');
        return Number(normalized) || 0;
    }
    return 0;
}

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabase = createServiceRoleClient();
        const data = await fetchPizzaDistributionRowsByProduct<SummaryStatsRow>(
            supabase,
            'product_name, min_stock, need_net, baked_at_factory',
        );

        let totalNorm = 0;
        let totalNeed = 0;
        const bakedByProduct = new Map<string, number>();

        for (const row of data || []) {
            totalNorm += safeNumber(row.min_stock);
            totalNeed += Math.max(0, safeNumber(row.need_net));

            const productName = String(row.product_name || '').trim();
            if (!productName) continue;

            const baked = Math.max(0, safeNumber(row.baked_at_factory));
            const current = bakedByProduct.get(productName) || 0;
            if (baked > current) {
                bakedByProduct.set(productName, baked);
            }
        }

        const totalBaked = Array.from(bakedByProduct.values()).reduce((sum, value) => sum + value, 0);
        const adjustedTotalNorm = totalNorm * PIZZA_NORM_MULTIPLIER;

        return NextResponse.json(
            {
                total_baked: totalBaked,
                total_norm: adjustedTotalNorm,
                total_need: totalNeed,
            },
            { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } }
        );
    } catch (error) {
        Logger.error('[Pizza Summary] Error', { error: serializeRouteError(error) });
        return NextResponse.json({ total_baked: 0, total_norm: 0, total_need: 0 });
    }
}
