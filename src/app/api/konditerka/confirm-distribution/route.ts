import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

interface DistributionConfirmation {
    distributions: Array<{
        storeId: number;
        productId: number;
        quantity: number;
    }>;
    userId?: string;
}

// Konditerka workshop storage (distribution source)
const SOURCE_WAREHOUSE_ID = 48;

/**
 * POST /api/konditerka/confirm-distribution
 * Executing distribution: creates movement documents in DB
 */
export async function POST(request: NextRequest) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const body: DistributionConfirmation = await request.json();
        const { distributions, userId } = body;

        if (!distributions || distributions.length === 0) {
            return NextResponse.json({ success: true, message: 'No distributions to process' });
        }

        const results = [];
        const errors = [];

        // Fetch spot->storage mapping from the distribution stats view.
        const { data: mapping, error: mapError } = await supabase
            .schema('konditerka1')
            .from('v_konditerka_distribution_stats')
            .select('spot_id, storage_id')
            .not('spot_id', 'is', null)
            .not('storage_id', 'is', null);

        if (mapError) {
            throw new Error(`Failed to fetch storage mapping: ${mapError.message}`);
        }

        const storeToStorageMap = new Map<number, number>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mapping?.forEach((row: any) => {
            const spotId = Number(row.spot_id);
            const storageId = Number(row.storage_id);
            if (Number.isFinite(spotId) && spotId > 0 && Number.isFinite(storageId) && storageId > 0) {
                storeToStorageMap.set(spotId, storageId);
            }
        });

        // Group payload by store: one movement document per destination store.
        const byStore = new Map<number, Array<{ productId: number; quantity: number }>>();
        for (const dist of distributions) {
            const storeId = Number(dist.storeId);
            const productId = Number(dist.productId);
            const quantity = Number(dist.quantity);
            if (!Number.isFinite(storeId) || !Number.isFinite(productId) || !Number.isFinite(quantity) || quantity <= 0) {
                continue;
            }
            const current = byStore.get(storeId) || [];
            current.push({ productId, quantity });
            byStore.set(storeId, current);
        }

        for (const [storeId, items] of byStore.entries()) {
            const targetStorageId = storeToStorageMap.get(storeId);
            if (!targetStorageId) {
                errors.push(`No storage mapping for store ${storeId}`);
                continue;
            }

            const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
            const userIdNumeric = Number(userId);
            const movementComment = `Konditerka distribution via API to store ${storeId}`;

            // 1) Header in categories.movements
            const { data: movementRow, error: movementError } = await supabase
                .schema('categories')
                .from('movements')
                .insert({
                    storage_id_from: SOURCE_WAREHOUSE_ID,
                    storage_id_to: targetStorageId,
                    movement_date: new Date().toISOString(),
                    user_id: Number.isFinite(userIdNumeric) ? userIdNumeric : null,
                    comment: movementComment,
                    total_sum: 0
                })
                .select('movement_id')
                .single();

            if (movementError || !movementRow?.movement_id) {
                errors.push(`Failed to create movement for store ${storeId}: ${movementError?.message || 'No movement_id returned'}`);
                continue;
            }

            // 2) Lines in categories.movement_items
            const movementItems = items.map((item) => ({
                movement_id: Number(movementRow.movement_id),
                product_id: item.productId,
                quantity: item.quantity,
                item_sum: 0
            }));

            const { error: itemsError } = await supabase
                .schema('categories')
                .from('movement_items')
                .insert(movementItems);

            if (itemsError) {
                errors.push(`Failed to create movement items for store ${storeId}: ${itemsError.message}`);
                continue;
            }

            results.push({
                movement_id: Number(movementRow.movement_id),
                store_id: storeId,
                storage_id_to: targetStorageId,
                lines: movementItems.length,
                total_qty: totalQty
            });
        }

        if (errors.length > 0) {
            return NextResponse.json({
                success: false,
                message: 'Some distributions failed',
                errors,
                results
            }, { status: 207 });
        }

        return NextResponse.json({
            success: true,
            message: 'Distribution confirmed and movements created',
            count: results.length
        });

    } catch (error) {
        console.error('[Confirm Distribution] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
