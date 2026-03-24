import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { syncPizzaLiveDataFromPoster } from '@/lib/pizza-live-sync';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface DistributionRequest {
    productId: number;
    productionQuantity: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface StoreStats {
    // New View Structure Mappings
    spot_id: number;      // Was store_id
    spot_name: string;    // Was store_name
    stock_now: number;    // Was current_stock
    norm_3_days: number;  // Was min_stock
    need_net: number;     // Was net_need
    priority: number;     // Was surplus_priority

    // Legacy support (optional, if view changes back)
    store_id?: number;
    current_stock?: number;
    min_stock?: number;
}

/**
 * POST /api/pizza/calculate-distribution
 * Calculates distribution plan based on 4-stage algorithm
 */
export async function POST(request: NextRequest) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabase = createServiceRoleClient();
        await syncPizzaLiveDataFromPoster(supabase).catch((error) => {
            Logger.error('[pizza calculate-distribution] live sync failed', { error: String(error) });
            return null;
        });

        const body: DistributionRequest = await request.json();
        const { productId, productionQuantity } = body;

        // Fetch stats for this product
        const { data: stores, error } = await supabase
            .schema('pizza1')
            .from('v_pizza_distribution_stats')
            .select('*')
            .eq('product_id', productId);

        if (error || !stores) {
            throw new Error(error?.message || 'Failed to fetch distribution stats');
        }

        // Initialize result map
        const result: Record<number, number> = {};
        let remaining = productionQuantity;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const storesData = stores as any[]; // Use any to be flexible with column names

        // Helper to accessor
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getId = (s: any) => s.spot_id || s.store_id || 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getStock = (s: any) => Number(s.stock_now ?? s.current_stock ?? 0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getMin = (s: any) => Number(s.norm_3_days ?? s.min_stock ?? 0);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
        const getNeed = (s: any) => Number(s.need_net ?? s.net_need ?? 0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getPriority = (s: any) => s.priority ?? s.surplus_priority ?? 999;

        // Initialize distribution for all stores to 0
        storesData.forEach(s => {
            const id = getId(s);
            if (id) result[id] = 0;
        });

        // --- STAGE 2: "Hygiene" (Fill Zeros) ---
        // Give 1 unit to stores with 0 stock
        const zeroStockStores = storesData.filter(s => getStock(s) === 0);
        for (const store of zeroStockStores) {
            if (remaining > 0) {
                const id = getId(store);
                if (id) {
                    result[id] += 1;
                    remaining -= 1;
                }
            }
        }

        // --- STAGE 3: Proportional Deficit ---
        if (remaining > 0) {
            let totalNetNeed = 0;
            const storeNeeds: { storeId: number; need: number }[] = [];

            storesData.forEach(s => {
                const id = getId(s);
                if (!id) return;

                const distributedSoFar = result[id];
                const effectiveStock = getStock(s) + distributedSoFar;
                // Recalculate need based on effective stock
                // If effective stock >= min (norm), need is 0
                // Otherwise need is min - effective

                // NOTE: logic was: if need_net > 0...
                // But need_net from view is static. We must account for Stage 2 distribution.
                const min = getMin(s);
                const need = Math.max(0, min - effectiveStock);

                if (need > 0) {
                    storeNeeds.push({ storeId: id, need });
                    totalNetNeed += need;
                }
            });

            if (totalNetNeed > 0) {
                if (remaining < totalNetNeed) {
                    // DEFICIT MODE: Proportional distribution
                    const K = remaining / totalNetNeed;

                    for (const item of storeNeeds) {
                        const qty = Math.floor(item.need * K);
                        if (qty > 0 && remaining >= qty) {
                            result[item.storeId] += qty;
                            remaining -= qty;
                        }
                    }
                } else {
                    // SURPLUS/ENOUGH MODE: Fill all needs to 100%
                    for (const item of storeNeeds) {
                        if (remaining >= item.need) {
                            result[item.storeId] += item.need;
                            remaining -= item.need;
                        } else {
                            // Should not happen if remaining >= totalNetNeed, but safety check
                            result[item.storeId] += remaining;
                            remaining = 0;
                        }
                    }
                }
            }
        }

        // --- STAGE 4: Surplus Distribution ---
        // If still remaining, distribute by priority
        if (remaining > 0) {
            const sortedByPriority = [...storesData].sort((a, b) => {
                const pA = getPriority(a);
                const pB = getPriority(b);
                return pA - pB;
            });

            while (remaining > 0) {
                let distributedInLoop = false;
                for (const store of sortedByPriority) {
                    if (remaining <= 0) break;
                    const id = getId(store);
                    if (id) {
                        result[id] += 1;
                        remaining -= 1;
                        distributedInLoop = true;
                    }
                }
                if (!distributedInLoop) break;
            }
        }

        return NextResponse.json({
            productId,
            originalQuantity: productionQuantity,
            distributed: result,
            remaining // Should be 0
        });

    } catch (error) {
        console.error('[Calculate Distribution] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
