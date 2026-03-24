export interface KonditerkaLiveSyncResult {
    businessDate: string;
    stockRows: number;
    stockStorages: number;
    manufactureHeaders: number;
    manufactureItems: number;
    totalProductionQty: number;
}

interface KonditerkaLiveSyncOptions {
    force?: boolean;
    shopStorageIds: number[];
}

const KONDITERKA_SYNC_COOLDOWN_MS = 30_000;

let lastKonditerkaSyncAt = 0;
let lastKonditerkaSyncResult: KonditerkaLiveSyncResult | null = null;
let konditerkaSyncInFlight: Promise<KonditerkaLiveSyncResult> | null = null;

function normalizeResult(payload: Record<string, unknown>): KonditerkaLiveSyncResult {
    return {
        businessDate: String(payload.businessDate || ''),
        stockRows: Number(payload.stockRows || 0),
        stockStorages: Number(payload.stockStorages || 0),
        manufactureHeaders: Number(payload.manufactureHeaders || 0),
        manufactureItems: Number(payload.manufactureItems || 0),
        totalProductionQty: Number(payload.totalProductionQty || 0),
    };
}

async function invokeEdge(
    functionName: string,
    shopStorageIds: number[],
    branch: 'konditerka1'
): Promise<KonditerkaLiveSyncResult> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase configuration for konditerka live sync');
    }

    const edgeUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${functionName}`;
    const response = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
        },
        body: JSON.stringify({
            branch,
            shop_storage_ids: shopStorageIds,
            workshop_storage_id: 48,
        }),
    });

    const rawBody = await response.text();
    let payload: Record<string, unknown> | null = null;
    if (rawBody) {
        try {
            payload = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
            payload = null;
        }
    }
    if (!response.ok) {
        const reason =
            (payload && typeof payload.error === 'string' && payload.error) ||
            (payload && typeof payload.message === 'string' && payload.message) ||
            rawBody ||
            `Edge sync failed with HTTP ${response.status}`;
        throw new Error(reason);
    }

    if (!payload || typeof payload !== 'object') {
        throw new Error('Edge sync returned empty payload');
    }

    return normalizeResult(payload);
}

async function runKonditerkaLiveSync(shopStorageIds: number[]): Promise<KonditerkaLiveSyncResult> {
    const explicit = (process.env.KONDITERKA_POSTER_SYNC_EDGE_FUNCTION || '').trim();
    const branch = 'konditerka1' as const;

    if (explicit) {
        return invokeEdge(explicit, shopStorageIds, branch);
    }

    return invokeEdge('poster-konditerka-sync', shopStorageIds, branch);
}

export async function syncKonditerkaLiveDataFromEdge(
    options: KonditerkaLiveSyncOptions
): Promise<KonditerkaLiveSyncResult> {
    const now = Date.now();
    const shopStorageIds = Array.from(new Set(options.shopStorageIds.filter((id) => id > 0))).sort((a, b) => a - b);

    if (shopStorageIds.length === 0) {
        return {
            businessDate: '',
            stockRows: 0,
            stockStorages: 0,
            manufactureHeaders: 0,
            manufactureItems: 0,
            totalProductionQty: 0,
        };
    }

    if (!options.force && lastKonditerkaSyncResult && now - lastKonditerkaSyncAt < KONDITERKA_SYNC_COOLDOWN_MS) {
        return lastKonditerkaSyncResult;
    }

    if (konditerkaSyncInFlight) {
        return konditerkaSyncInFlight;
    }

    konditerkaSyncInFlight = runKonditerkaLiveSync(shopStorageIds);
    try {
        const result = await konditerkaSyncInFlight;
        lastKonditerkaSyncAt = Date.now();
        lastKonditerkaSyncResult = result;
        return result;
    } finally {
        konditerkaSyncInFlight = null;
    }
}
