import type { SupabaseClient } from '@supabase/supabase-js';

export interface PizzaLiveProductionItem {
    product_id: number;
    product_name: string;
    quantity: number;
}

export interface PizzaLiveSyncResult {
    businessDate: string;
    stockRows: number;
    stockStorages: number;
    manufactureHeaders: number;
    manufactureItems: number;
    productionItems: PizzaLiveProductionItem[];
    totalProductionQty: number;
}

interface PizzaLiveSyncOptions {
    force?: boolean;
}

const PIZZA_SYNC_COOLDOWN_MS = 30_000;

let lastPizzaSyncAt = 0;
let lastPizzaSyncResult: PizzaLiveSyncResult | null = null;
let pizzaSyncInFlight: Promise<PizzaLiveSyncResult> | null = null;

async function runPizzaLiveSync(): Promise<PizzaLiveSyncResult> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const edgeFunctionName = process.env.PIZZA_POSTER_SYNC_EDGE_FUNCTION || 'poster-pizza-sync';

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase configuration for pizza live sync');
    }

    const edgeUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${edgeFunctionName}`;
    const response = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
        },
        body: JSON.stringify({
            branch: 'pizza1',
            shop_storage_ids: [2, 3, 5, 6, 7, 8, 9, 20, 21, 25, 26, 30, 33, 34, 36, 39, 43, 44, 45, 47, 52, 53, 55],
            workshop_storage_id: 15,
        }),
    });

    const payload = (await response.json().catch(() => null)) as
        | (PizzaLiveSyncResult & { error?: string })
        | { error?: string }
        | null;

    if (!response.ok) {
        const message =
            (payload && typeof payload.error === 'string' && payload.error) ||
            `Edge sync failed with HTTP ${response.status}`;
        throw new Error(message);
    }

    if (!payload || typeof payload !== 'object') {
        throw new Error('Edge sync returned empty payload');
    }

    const result = {
        businessDate: String((payload as PizzaLiveSyncResult).businessDate || ''),
        stockRows: Number((payload as PizzaLiveSyncResult).stockRows || 0),
        stockStorages: Number((payload as PizzaLiveSyncResult).stockStorages || 0),
        manufactureHeaders: Number((payload as PizzaLiveSyncResult).manufactureHeaders || 0),
        manufactureItems: Number((payload as PizzaLiveSyncResult).manufactureItems || 0),
        productionItems: Array.isArray((payload as PizzaLiveSyncResult).productionItems)
            ? (payload as PizzaLiveSyncResult).productionItems
            : [],
        totalProductionQty: Number((payload as PizzaLiveSyncResult).totalProductionQty || 0),
    };

    lastPizzaSyncAt = Date.now();
    lastPizzaSyncResult = result;

    return result;
}

export async function syncPizzaLiveDataFromPoster(
    _supabase?: SupabaseClient,
    options: PizzaLiveSyncOptions = {}
): Promise<PizzaLiveSyncResult> {
    const now = Date.now();

    if (!options.force && lastPizzaSyncResult && now - lastPizzaSyncAt < PIZZA_SYNC_COOLDOWN_MS) {
        return lastPizzaSyncResult;
    }

    if (pizzaSyncInFlight) {
        return pizzaSyncInFlight;
    }

    pizzaSyncInFlight = runPizzaLiveSync();

    try {
        return await pizzaSyncInFlight;
    } finally {
        pizzaSyncInFlight = null;
    }
}
