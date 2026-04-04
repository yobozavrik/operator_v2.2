import type { SupabaseClient } from '@supabase/supabase-js';
import { getTodayManufactures } from '@/lib/poster-api';
import { Logger } from '@/lib/logger';

export type BranchSchema = 'bulvar1' | 'florida1' | 'konditerka1';

export interface BranchProductionItem {
    product_id: number;
    product_name: string;
    quantity: number;
}

export interface BranchProductionSyncResult {
    businessDate: string;
    storageId: number;
    items: BranchProductionItem[];
    itemsCount: number;
    totalQty: number;
    persisted: boolean;
    warning?: string;
}

interface BranchProductionSyncOptions {
    categoryKeywords?: string[] | null;
}

function toPositiveNumber(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed;
}

function getKyivBusinessDate(date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(date);
}

function aggregatePosterProductionRows(rows: Array<Record<string, unknown>>): BranchProductionItem[] {
    const byProduct = new Map<number, BranchProductionItem>();

    rows.forEach((row) => {
        const productId = Number(row.product_id);
        if (!Number.isFinite(productId) || productId <= 0) return;

        const quantity =
            toPositiveNumber(row.product_num) ||
            toPositiveNumber(row.quantity) ||
            toPositiveNumber(row.num) ||
            toPositiveNumber(row.amount);

        if (quantity <= 0) return;

        const rawName = String(row.product_name || row.ingredient_name || '').trim();
        const productName = rawName || `Product ${productId}`;

        const current = byProduct.get(productId) || {
            product_id: productId,
            product_name: productName,
            quantity: 0,
        };

        current.product_name = current.product_name || productName;
        current.quantity += quantity;
        byProduct.set(productId, current);
    });

    return Array.from(byProduct.values()).sort((a, b) => b.quantity - a.quantity);
}

async function persistBranchProductionSnapshot(
    supabase: SupabaseClient,
    schema: BranchSchema,
    storageId: number,
    businessDate: string,
    items: BranchProductionItem[]
): Promise<void> {
    const headerRes = await supabase
        .schema(schema)
        .from('manufactures')
        .select('manufacture_id')
        .eq('business_date', businessDate)
        .eq('storage_id', storageId)
        .eq('source', 'poster_live')
        .order('manufacture_id', { ascending: false })
        .limit(1);

    if (headerRes.error) {
        throw new Error(headerRes.error.message);
    }

    const existing = Array.isArray(headerRes.data) ? headerRes.data[0] : null;
    let manufactureId = Number(existing?.manufacture_id || 0);

    if (!Number.isFinite(manufactureId) || manufactureId <= 0) {
        const insertRes = await supabase
            .schema(schema)
            .from('manufactures')
            .insert({
                business_date: businessDate,
                storage_id: storageId,
                source: 'poster_live',
                synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .select('manufacture_id')
            .single();

        if (insertRes.error) {
            throw new Error(insertRes.error.message);
        }

        manufactureId = Number(insertRes.data?.manufacture_id || 0);
        if (!Number.isFinite(manufactureId) || manufactureId <= 0) {
            throw new Error('Failed to resolve manufacture_id for branch snapshot');
        }
    } else {
        const { error: touchError } = await supabase
            .schema(schema)
            .from('manufactures')
            .update({
                synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('manufacture_id', manufactureId);

        if (touchError) {
            throw new Error(touchError.message);
        }
    }

    const { error: cleanupError } = await supabase
        .schema(schema)
        .from('manufacture_items')
        .delete()
        .eq('manufacture_id', manufactureId);

    if (cleanupError) {
        throw new Error(cleanupError.message);
    }

    if (items.length > 0) {
        const payload = items.map((item) => ({
            manufacture_id: manufactureId,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            source: 'poster_live',
            updated_at: new Date().toISOString(),
        }));

        const { error: insertItemsError } = await supabase
            .schema(schema)
            .from('manufacture_items')
            .insert(payload);

        if (insertItemsError) {
            throw new Error(insertItemsError.message);
        }
    }
}

async function upsertBranchCatalogFromLiveProduction(
    supabase: SupabaseClient,
    schema: BranchSchema,
    storageId: number,
    items: BranchProductionItem[]
): Promise<void> {
    if (items.length === 0) return;

    const nowIso = new Date().toISOString();
    const payload = items.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        source_storage_id: storageId,
        refreshed_at: nowIso,
        updated_at: nowIso,
    }));

    const { error } = await supabase
        .schema(schema)
        .from('production_180d_products')
        .upsert(payload, { onConflict: 'product_id' });

    if (error) {
        throw new Error(error.message);
    }
}

export async function syncBranchProductionFromPoster(
    supabase: SupabaseClient,
    schema: BranchSchema,
    storageId: number,
    options: BranchProductionSyncOptions = {}
): Promise<BranchProductionSyncResult> {
    const businessDate = getKyivBusinessDate();
    const rawRows = (await getTodayManufactures({
        categoryKeywords: options.categoryKeywords ?? null,
        storageId,
    })) as Array<Record<string, unknown>>;
    const items = aggregatePosterProductionRows(rawRows);
    const totalQty = Number(items.reduce((sum, item) => sum + item.quantity, 0).toFixed(3));

    try {
        await persistBranchProductionSnapshot(supabase, schema, storageId, businessDate, items);
        let warning: string | undefined;
        try {
            await upsertBranchCatalogFromLiveProduction(supabase, schema, storageId, items);
        } catch (catalogError) {
            warning = catalogError instanceof Error ? catalogError.message : String(catalogError);
            Logger.warn('[branch production sync] Catalog upsert skipped', {
                meta: { schema, storageId, warning },
            });
        }

        return {
            businessDate,
            storageId,
            items,
            itemsCount: items.length,
            totalQty,
            persisted: true,
            warning,
        };
    } catch (error) {
        const warning = error instanceof Error ? error.message : String(error);
        Logger.warn('[branch production sync] Snapshot persist skipped', {
            meta: { schema, storageId, warning },
        });
        return {
            businessDate,
            storageId,
            items,
            itemsCount: items.length,
            totalQty,
            persisted: false,
            warning,
        };
    }
}
