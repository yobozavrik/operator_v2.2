import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type ProductionRow = {
    product_name?: string | null;
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

function groupProductionRows(rows: ProductionRow[]): Array<{ product_name: string; baked_at_factory: number }> {
    const grouped = new Map<string, number>();

    for (const row of rows) {
        const productName = String(row.product_name || '').trim();
        const baked = Math.max(0, safeNumber(row.baked_at_factory));
        if (!productName || baked <= 0) continue;

        const current = grouped.get(productName) || 0;
        if (baked > current) {
            grouped.set(productName, baked);
        }
    }

    return Array.from(grouped.entries())
        .map(([product_name, baked_at_factory]) => ({ product_name, baked_at_factory }))
        .sort((a, b) => b.baked_at_factory - a.baked_at_factory);
}

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabase = createServiceRoleClient();

        const primaryResult = await supabase
            .schema('pizza1')
            .from('v_pizza_production_only')
            .select('product_name, baked_at_factory')
            .order('baked_at_factory', { ascending: false });

        if (!primaryResult.error && (primaryResult.data?.length || 0) > 0) {
            return NextResponse.json(groupProductionRows((primaryResult.data || []) as ProductionRow[]));
        }

        if (primaryResult.error) {
            Logger.error('[Pizza Production Detail] primary query failed', { error: primaryResult.error.message });
        }

        const fallbackResult = await supabase
            .schema('pizza1')
            .from('v_pizza_distribution_stats')
            .select('product_name, baked_at_factory');

        if (fallbackResult.error) {
            Logger.error('[Pizza Production Detail] stats fallback failed', { error: fallbackResult.error.message });
            return NextResponse.json([], { status: 200 });
        }

        return NextResponse.json(groupProductionRows((fallbackResult.data || []) as ProductionRow[]));
    } catch (error) {
        Logger.error('[Pizza Production Detail] Error', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json([], { status: 200 });
    }
}
