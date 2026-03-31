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

type ProductIdRow = {
    product_id: number;
};

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

export async function fetchPizzaDistributionRowsByProduct<T>(
    supabase: SupabaseClient,
    selectClause: string,
    options?: { productIds?: number[] },
): Promise<T[]> {
    const productIds = options?.productIds ?? await fetchActivePizzaProductIds(supabase);

    if (productIds.length === 0) {
        return [];
    }

    const { data, error } = await supabase
        .schema('pizza1')
        .from('v_pizza_distribution_stats')
        .select(selectClause)
        .in('product_id', productIds)
        .order('product_id', { ascending: true })
        .order('spot_name', { ascending: true });

    if (error) {
        throw new Error(`v_pizza_distribution_stats: ${error.message}`);
    }

    return (data || []) as T[];
}
