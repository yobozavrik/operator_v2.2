import type { SupabaseClient } from '@supabase/supabase-js';

const PIZZA_ACTIVE_PRODUCT_IDS = [
    292, 294, 295, 297, 298, 300, 301, 573,
    658, 659, 660, 879, 1054, 1055, 1098, 1099,
] as const;

export function serializeRouteError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

type ProductIdRow = { product_id: number };

type PizzaLegacyDistributionRow = {
    product_id: number;
    product_name: string | null;
    spot_name: string | null;
    avg_sales_day: number | string | null;
    min_stock: number | string | null;
    stock_now: number | string | null;
    baked_at_factory: number | string | null;
};

type PizzaOosDistributionRow = {
    product_id: number;
    product_name: string | null;
    spot_name: string | null;
    spot_id: number | string | null;
    avg_sales_day: number | string | null;
    min_stock: number | string | null;
};

type PizzaOosFlagRow = {
    spot_id: number;
    use_oos_logic: boolean | null;
};

export type PizzaDistributionRow = {
    product_id: number;
    product_name: string;
    spot_name: string;
    avg_sales_day: number;
    min_stock: number;
    stock_now: number;
    baked_at_factory: number;
    need_net: number;
};

function normalizeText(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
}

function buildMergeKey(productId: number, spotName: string): string {
    return `${productId}::${normalizeText(spotName)}`;
}

function safeNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').replace(/[^0-9.-]/g, '');
        return Number(normalized) || 0;
    }
    return 0;
}

function parseSelectColumns(selectClause: string): string[] {
    if (!selectClause || selectClause.trim() === '*') {
        return [];
    }

    return selectClause
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => part.split(/\s+as\s+/i).pop() || part)
        .map((part) => part.replace(/^[a-z0-9_]+\./i, '').trim())
        .filter(Boolean);
}

function projectRow<T extends Record<string, unknown>>(row: PizzaDistributionRow, selectClause: string): T {
    const columns = parseSelectColumns(selectClause);
    if (columns.length === 0) {
        return row as unknown as T;
    }

    const projected: Record<string, unknown> = {};
    for (const column of columns) {
        if (column in row) {
            projected[column] = row[column as keyof PizzaDistributionRow];
        }
    }

    return projected as T;
}

export async function fetchActivePizzaProductIds(
    supabase: SupabaseClient,
): Promise<number[]> {
    const { data, error } = await supabase
        .schema('pizza1')
        .from('product_leftovers_map')
        .select('product_id')
        .eq('active', true)
        .order('product_id', { ascending: true });

    if (error) {
        return [...PIZZA_ACTIVE_PRODUCT_IDS];
    }

    const runtimeIds = ((data || []) as ProductIdRow[])
        .map((row) => Number(row.product_id))
        .filter((value) => Number.isFinite(value) && value > 0);

    if (runtimeIds.length === 0) {
        return [...PIZZA_ACTIVE_PRODUCT_IDS];
    }

    return runtimeIds;
}

async function fetchPizzaOosFlags(supabase: SupabaseClient): Promise<Map<number, boolean>> {
    const { data, error } = await supabase
        .schema('pizza1')
        .from('pizza_oos_logic_flags')
        .select('spot_id, use_oos_logic');

    if (error) {
        return new Map();
    }

    const flags = new Map<number, boolean>();
    for (const row of (data || []) as PizzaOosFlagRow[]) {
        if (!Number.isFinite(row.spot_id)) continue;
        flags.set(Number(row.spot_id), row.use_oos_logic === true);
    }

    return flags;
}

function mergePizzaRows(
    legacyRows: PizzaLegacyDistributionRow[],
    oosRows: PizzaOosDistributionRow[],
    flagsBySpotId: Map<number, boolean>,
): PizzaDistributionRow[] {
    const oosByKey = new Map<string, PizzaOosDistributionRow>();

    for (const row of oosRows) {
        const productId = Number(row.product_id);
        const spotName = String(row.spot_name || '').trim();
        if (!Number.isFinite(productId) || productId <= 0 || !spotName) continue;
        oosByKey.set(buildMergeKey(productId, spotName), row);
    }

    const mergedRows: PizzaDistributionRow[] = [];

    for (const row of legacyRows) {
        const productId = Number(row.product_id);
        const productName = String(row.product_name || '').trim();
        const spotName = String(row.spot_name || '').trim();
        if (!Number.isFinite(productId) || productId <= 0 || !productName || !spotName) continue;

        const legacyAvgSales = Math.max(0, safeNumber(row.avg_sales_day));
        const legacyMinStock = Math.max(0, Math.trunc(safeNumber(row.min_stock)));
        const legacyStockNow = Math.max(0, Math.trunc(safeNumber(row.stock_now)));
        const legacyBaked = Math.max(0, Math.trunc(safeNumber(row.baked_at_factory)));

        const oosRow = oosByKey.get(buildMergeKey(productId, spotName));
        const spotId = Math.trunc(safeNumber(oosRow?.spot_id));
        const useOosLogic = Number.isFinite(spotId) && spotId > 0
            ? flagsBySpotId.get(spotId) === true
            : false;

        const selectedAvgSales = useOosLogic && oosRow?.avg_sales_day != null
            ? Math.max(0, safeNumber(oosRow.avg_sales_day))
            : legacyAvgSales;
        const selectedMinStock = useOosLogic && oosRow?.min_stock != null
            ? Math.max(0, Math.trunc(safeNumber(oosRow.min_stock)))
            : legacyMinStock;

        mergedRows.push({
            product_id: productId,
            product_name: productName,
            spot_name: spotName,
            avg_sales_day: selectedAvgSales,
            min_stock: selectedMinStock,
            stock_now: legacyStockNow,
            baked_at_factory: legacyBaked,
            need_net: Math.max(0, selectedMinStock - legacyStockNow),
        });
    }

    return mergedRows.sort((a, b) => {
        if (a.product_id !== b.product_id) return a.product_id - b.product_id;
        return a.spot_name.localeCompare(b.spot_name);
    });
}

async function fetchPizzaDistributionRowsForProduct(
    supabase: SupabaseClient,
    productId: number,
    flagsBySpotId: Map<number, boolean>,
): Promise<PizzaDistributionRow[]> {
    const [legacyResult, oosResult] = await Promise.all([
        supabase
            .schema('pizza1')
            .from('v_pizza_distribution_stats_legacy')
            .select('product_id, product_name, spot_name, avg_sales_day, min_stock, stock_now, baked_at_factory')
            .eq('product_id', productId)
            .order('spot_name', { ascending: true }),
        supabase
            .schema('pizza1')
            .from('v_pizza_distribution_stats_oos')
            .select('product_id, product_name, spot_name, spot_id, avg_sales_day, min_stock')
            .eq('product_id', productId)
            .order('spot_name', { ascending: true }),
    ]);

    if (legacyResult.error) {
        throw new Error(`v_pizza_distribution_stats_legacy: ${legacyResult.error.message}`);
    }

    const legacyRows = (legacyResult.data || []) as PizzaLegacyDistributionRow[];
    const oosRows = oosResult.error ? [] : (oosResult.data || []) as PizzaOosDistributionRow[];

    return mergePizzaRows(legacyRows, oosRows, flagsBySpotId);
}

export async function fetchPizzaDistributionRowsByProduct<T extends Record<string, unknown>>(
    supabase: SupabaseClient,
    selectClause: string,
    options?: { productIds?: number[] },
): Promise<T[]> {
    const productIds = options?.productIds ?? await fetchActivePizzaProductIds(supabase);

    if (productIds.length === 0) {
        return [];
    }

    const flagsBySpotId = await fetchPizzaOosFlags(supabase);
    const rows: PizzaDistributionRow[] = [];
    const batchSize = 4;

    for (let index = 0; index < productIds.length; index += batchSize) {
        const batch = productIds.slice(index, index + batchSize);
        const batchRows = await Promise.all(
            batch.map((productId) => fetchPizzaDistributionRowsForProduct(supabase, productId, flagsBySpotId)),
        );

        for (const item of batchRows) {
            rows.push(...item);
        }
    }

    return rows.map((row) => projectRow<T>(row, selectClause));
}
