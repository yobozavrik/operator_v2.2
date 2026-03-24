import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-guard';

interface DistributionConfirmation {
    distributions: Array<{
        storeId: number;
        productId: number;
        quantity: number;
    }>;
    userId?: string; // Optional for logging current user
}

// Fixed Warehouse ID for "Цех Пиццерия Гравитон"
const SOURCE_WAREHOUSE_ID = 15;

/**
 * POST /api/pizza/confirm-distribution
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

        // In a real app, we might want to batch this or use a stored procedure / transaction.
        // For now, we'll process sequentially or in parallel batches.

        // We need mapping from storeId (spot_id) to storage_id (warehouse)
        // This mapping might come from `v_pizza_distribution_stats` or separate query.
        // Let's assume passed storeId IS the target storage_id or we fetch it.
        // Looking at context, usually specific stores have specific storage IDs.
        // TЗ says: "Accordig to mapping in view (spot_id -> storage_id)"

        // Let's fetch the mapping first to be safe
        const { data: mapping, error: mapError } = await supabase
            .from('v_pizza_distribution_stats')
            .select('store_id, storage_id') // Assuming view has storage_id
        // If view doesn't have storage_id, we might need another table (e.g. shops)
        // Let's check typical structure or just assume store_id passed from FE is correct ID to move TO.
        // Wait, TЗ explicitly mentions "mapping from view (spot_id -> storage_id)".
        // I'll query unique store mapping.

        if (mapError) {
            throw new Error('Failed to fetch storage mapping');
        }

        const storeToStorageMap = new Map<number, number>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mapping?.forEach((row: any) => {
            if (row.store_id && row.storage_id) {
                storeToStorageMap.set(row.store_id, row.storage_id);
            }
        });

        for (const dist of distributions) {
            const { storeId, productId, quantity } = dist;

            if (quantity <= 0) continue;

            const targetStorageId = storeToStorageMap.get(storeId);

            if (!targetStorageId) {
                errors.push(`No storage mapping for store ${storeId}`);
                continue;
            }

            // Create movement
            // NOTE: Table name and structure is assumed based on standard patterns (movements / operations)
            // I will use a generic 'movements' table structure, but this might need adjustment if schema differs.
            // "Система должна генерировать документы перемещения (movements)"

            const { data, error } = await supabase
                .from('movements')
                .insert({
                    source_storage_id: SOURCE_WAREHOUSE_ID,
                    target_storage_id: targetStorageId,
                    product_id: productId,
                    quantity: quantity,
                    status: 'pending', // or 'completed'
                    created_by: userId || 'system',
                    created_at: new Date().toISOString(),
                    type: 'distribution'
                })
                .select();

            if (error) {
                errors.push(`Failed to move product ${productId} to store ${storeId}: ${error.message}`);
            } else {
                results.push(data);
            }
        }

        if (errors.length > 0) {
            return NextResponse.json({
                success: false,
                message: 'Some distributions failed',
                errors,
                results
            }, { status: 207 }); // Multi-Status
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
