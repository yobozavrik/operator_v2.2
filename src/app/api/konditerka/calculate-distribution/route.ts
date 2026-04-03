import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-guard';
import { calculateBranchDistribution, type NormalizedDistributionRow } from '@/lib/branch-api';
import { normalizeKonditerkaUnit } from '@/lib/konditerka-dictionary';
import { fetchKonditerkaStoreRevenuePriorityMap } from '@/lib/konditerka-store-revenue';

export const dynamic = 'force-dynamic';

interface DistributionRequest {
    productId: number;
    productionQuantity: number;
}

interface RuntimeStoreRow {
    spot_id: number;
    spot_name: string;
    stock_now: number;
    norm_3_days: number;
    need_net: number;
    priority: number;
    unit?: string;
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

async function buildFallbackStoresForNewProduct(productId: number): Promise<RuntimeStoreRow[]> {
    const { data: baseRows, error: baseError } = await supabase
        .schema('konditerka1')
        .from('v_konditerka_distribution_stats')
        .select('spot_id, spot_name, storage_id');

    if (baseError) {
        throw new Error(`Failed to load store mapping: ${baseError.message}`);
    }

    const storesMap = new Map<number, { spot_id: number; spot_name: string; storage_id: number | null }>();
    for (const raw of (baseRows || []) as Array<Record<string, unknown>>) {
        const spotId = toPositiveInt(raw.spot_id);
        if (!spotId) continue;

        const spotName = String(raw.spot_name || '').trim();
        const storageId = toPositiveInt(raw.storage_id);
        if (!storesMap.has(spotId)) {
            storesMap.set(spotId, {
                spot_id: spotId,
                spot_name: spotName || `Spot ${spotId}`,
                storage_id: storageId,
            });
        }
    }

    if (storesMap.size === 0) {
        throw new Error('No active Konditerka stores found for fallback distribution');
    }

    const storageIds = Array.from(
        new Set(
            Array.from(storesMap.values())
                .map((s) => s.storage_id)
                .filter((v): v is number => Number.isFinite(v) && Number(v) > 0)
        )
    );

    const stockByStorage = new Map<number, number>();
    if (storageIds.length > 0) {
        const { data: leftoversRows, error: leftoversError } = await supabase
            .schema('konditerka1')
            .from('leftovers')
            .select('storage_id, count')
            .eq('product_id', productId)
            .in('storage_id', storageIds);

        if (leftoversError) {
            throw new Error(`Failed to load leftovers fallback: ${leftoversError.message}`);
        }

        for (const row of (leftoversRows || []) as Array<Record<string, unknown>>) {
            const storageId = toPositiveInt(row.storage_id);
            if (!storageId) continue;
            stockByStorage.set(storageId, Math.max(0, toNumber(row.count)));
        }
    }

    const fallbackRows: RuntimeStoreRow[] = Array.from(storesMap.values()).map((store) => ({
        spot_id: store.spot_id,
        spot_name: store.spot_name,
        stock_now: store.storage_id ? stockByStorage.get(store.storage_id) ?? 0 : 0,
        norm_3_days: 0,
        need_net: 0,
        priority: 999,
    }));

    fallbackRows.sort((a, b) => a.stock_now - b.stock_now || a.spot_name.localeCompare(b.spot_name));
    fallbackRows.forEach((row, idx) => {
        row.priority = idx + 1;
    });

    return fallbackRows;
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
        })) as RuntimeStoreRow[];

        let runtimeStores = storesData.filter((s) => s.spot_id > 0);
        let usedFallback = false;

        if (runtimeStores.length === 0) {
            runtimeStores = await buildFallbackStoresForNewProduct(productId);
            runtimeStores = runtimeStores.map((row) => ({ ...row, unit }));
            usedFallback = true;
        }

        const allocationRows: NormalizedDistributionRow[] = runtimeStores.map((store) => ({
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
