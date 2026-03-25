import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { fetchFloridaProduction180dProductIds } from '@/lib/florida-production-180d';
import { createServiceRoleClient } from '@/lib/branch-api';
import { applyFloridaPackagingConfigToRows, fetchFloridaPackagingConfig } from '@/lib/florida-packaging';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type DistributionRow = {
    product_id: number;
    product_name: string;
    spot_name: string;
    unit: string;
    stock_now: number;
    min_stock: number;
    avg_sales_day: number;
    need_net: number;
};

async function fetchDistributionRows(
    supabase: SupabaseClient,
    workshopProductIds: number[]
): Promise<DistributionRow[]> {
    const { data, error } = await supabase
        .schema('florida1')
        .from('v_florida_distribution_stats')
        .select('product_id, product_name, spot_name, unit, stock_now, min_stock, avg_sales_day, need_net')
        .in('product_id', workshopProductIds);

    if (error) {
        throw new Error(error.message);
    }

    return (Array.isArray(data) ? data : []) as DistributionRow[];
}

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabase = createServiceRoleClient();
        const workshopProductIds = await fetchFloridaProduction180dProductIds(supabase);
        if (workshopProductIds.length === 0) {
            return NextResponse.json([]);
        }

        const distributionRows = await fetchDistributionRows(supabase, workshopProductIds);
        const productIds = Array.from(
            new Set(
                distributionRows
                    .map((row) => Number(row.product_id))
                    .filter((id) => Number.isFinite(id) && id > 0)
            )
        );
        const configMap = await fetchFloridaPackagingConfig(supabase, productIds).catch(() => new Map());
        const enrichedRows = applyFloridaPackagingConfigToRows(distributionRows, configMap);

        return NextResponse.json(enrichedRows);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        Logger.error('Critical Florida API Error', { error: message });
        return NextResponse.json({
            error: 'Internal Server Error',
            message,
        }, { status: 500 });
    }
}
