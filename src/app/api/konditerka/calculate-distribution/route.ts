import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-guard';
import { calculateBranchDistribution, type NormalizedDistributionRow } from '@/lib/branch-api';
import { buildKonditerkaFallbackAllocationRows } from '@/lib/konditerka-distribution-fallback';
import { normalizeKonditerkaUnit } from '@/lib/konditerka-dictionary';
import { fetchKonditerkaStoreRevenuePriorityMap } from '@/lib/konditerka-store-revenue';

export const dynamic = 'force-dynamic';

interface DistributionRequest {
    productId: number;
    productionQuantity: number;
}

function toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value.replace(',', '.'));
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

function toPositiveInt(value: unknown): number | null {
    const n = Math.trunc(toNumber(value));
    return n > 0 ? n : null;
}

/**
 * POST /api/konditerka/calculate-distribution
 * Calculates distribution plan based on shared Konditerka allocator.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const body: DistributionRequest = await request.json();
        const { productId, productionQuantity } = body;

        if (!Number.isFinite(productId) || productId <= 0) {
            return NextResponse.json({ error: 'Invalid productId' }, { status: 400 });
        }
        if (!Number.isFinite(productionQuantity) || productionQuantity < 0) {
            return NextResponse.json({ error: 'Invalid productionQuantity' }, { status: 400 });
        }

        const { data: stores, error } = await supabase
            .schema('konditerka1')
            .from('v_konditerka_distribution_stats')
            .select('*')
            .eq('product_id', productId);

        if (error) {
            throw new Error(error.message || 'Failed to fetch distribution stats');
        }

        const { data: unitRow, error: unitError } = await supabase
            .schema('konditerka1')
            .from('production_180d_products')
            .select('unit')
            .eq('product_id', productId)
            .maybeSingle();

        if (unitError) {
            throw new Error(`Failed to fetch product unit: ${unitError.message}`);
        }

        const unit = normalizeKonditerkaUnit(unitRow?.unit);
        const storePriorityByStoreId = await fetchKonditerkaStoreRevenuePriorityMap().catch(
            () => new Map<number, number>()
        );

        const storesData = ((stores || []) as Array<Record<string, unknown>>).map((s) => ({
            spot_id: toPositiveInt(s.spot_id) || toPositiveInt(s.store_id) || 0,
            spot_name: String(s.spot_name || s.store_name || '').trim(),
            stock_now: Math.max(0, toNumber(s.stock_now ?? s.current_stock ?? 0)),
            norm_3_days: Math.max(0, toNumber(s.norm_3_days ?? s.min_stock ?? 0)),
            need_net: Math.max(0, toNumber(s.need_net ?? s.net_need ?? 0)),
            priority: Math.max(1, Math.trunc(toNumber(s.priority ?? s.surplus_priority ?? 999))),
            unit,
        }));

        let allocationRows: NormalizedDistributionRow[] = storesData
            .filter((store) => store.spot_id > 0)
            .map((store) => ({
                productId,
                productName: String((stores as Array<Record<string, unknown>>)[0]?.product_name || `Product ${productId}`),
                storeId: store.spot_id,
                storeName: store.spot_name,
                unit,
                stockNow: store.stock_now,
                minStock: store.norm_3_days,
                avgSalesDay: 0,
                needNet: store.need_net,
                bakedAtFactory: productionQuantity,
            }));
        let usedFallback = false;

        if (allocationRows.length === 0) {
            allocationRows = await buildKonditerkaFallbackAllocationRows(supabase, {
                productId,
                productName: String((stores as Array<Record<string, unknown>>)[0]?.product_name || `Product ${productId}`),
                productionQuantity,
                unit,
            });
            usedFallback = true;
        }

        const calc = calculateBranchDistribution(allocationRows, productId, productionQuantity, {
            unit,
            storePriorityByStoreId,
        });

        return NextResponse.json({
            productId,
            originalQuantity: calc.originalQuantity,
            distributed: calc.distributed,
            remaining: calc.remaining,
            usedFallback,
        });
    } catch (error) {
        console.error('[Calculate Distribution] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
