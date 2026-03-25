import type { SupabaseClient } from '@supabase/supabase-js';

export interface FloridaPackagingConfig {
    product_id: number;
    product_name_snapshot: string;
    is_active: boolean;
    pack_weight_min_kg: number;
    pack_weight_max_kg: number;
    pack_weight_calc_kg: number;
    pack_zero_threshold_kg: number;
    packs_rounding_mode: 'ceil' | 'round' | 'floor';
    notes?: string | null;
}

type DistributionLikeRow = {
    product_id?: number | string | null;
    spot_id?: number | string | null;
    unit?: string | null;
    stock_now?: number | string | null;
    min_stock?: number | string | null;
    avg_sales_day?: number | string | null;
    need_net?: number | string | null;
    quantity_to_ship?: number | string | null;
    [key: string]: unknown;
};

function toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').trim();
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function round3(value: number): number {
    return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function round1(value: number): number {
    return Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
}

function normalizeUnit(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

function isKgUnit(value: unknown): boolean {
    const unit = normalizeUnit(value);
    return unit === 'kg' || unit === 'кг';
}

export async function fetchFloridaPackagingConfig(
    supabase: SupabaseClient,
    productIds: number[]
): Promise<Map<number, FloridaPackagingConfig>> {
    const ids = Array.from(new Set(productIds.filter((id) => Number.isFinite(id) && id > 0)));
    if (ids.length === 0) return new Map();

    const { data, error } = await supabase
        .schema('florida1')
        .from('product_packaging_config')
        .select(
            'product_id, product_name_snapshot, is_active, pack_weight_min_kg, pack_weight_max_kg, pack_weight_calc_kg, pack_zero_threshold_kg, packs_rounding_mode, notes'
        )
        .in('product_id', ids)
        .eq('is_active', true);

    if (error) {
        throw new Error(error.message);
    }

    return new Map(
        (data || []).map((row: Record<string, unknown>) => [
            Number(row.product_id),
            {
                product_id: Number(row.product_id),
                product_name_snapshot: String(row.product_name_snapshot || ''),
                is_active: Boolean(row.is_active),
                pack_weight_min_kg: toNumber(row.pack_weight_min_kg),
                pack_weight_max_kg: toNumber(row.pack_weight_max_kg),
                pack_weight_calc_kg: toNumber(row.pack_weight_calc_kg),
                pack_zero_threshold_kg: toNumber(row.pack_zero_threshold_kg),
                packs_rounding_mode: String(row.packs_rounding_mode || 'ceil') as
                    | 'ceil'
                    | 'round'
                    | 'floor',
                notes: row.notes ? String(row.notes) : null,
            } satisfies FloridaPackagingConfig,
        ])
    );
}

export function estimateFloridaPackagingPacks(kg: number, config: FloridaPackagingConfig): number {
    const safeKg = Math.max(0, toNumber(kg));
    if (safeKg <= config.pack_zero_threshold_kg) return 0;

    const ratio = safeKg / Math.max(config.pack_weight_calc_kg, 0.001);
    switch (config.packs_rounding_mode) {
        case 'floor':
            return Math.max(0, Math.floor(ratio));
        case 'round':
            return Math.max(0, Math.round(ratio));
        case 'ceil':
        default:
            return Math.max(0, Math.ceil(ratio));
    }
}

export function applyFloridaPackagingConfigToRows<T extends DistributionLikeRow>(
    rows: T[],
    configMap: Map<number, FloridaPackagingConfig>
): Array<T & Record<string, unknown>> {
    return rows.map((row) => {
        const productId = Number(row.product_id);
        const config = configMap.get(productId);
        const unit = String(row.unit || '').trim() || 'шт';
        const stockNow = Math.max(0, toNumber(row.stock_now));
        const avgSalesDay = Math.max(0, toNumber(row.avg_sales_day));
        const rawMinStock = Math.max(0, toNumber(row.min_stock));
        const quantityToShip = Math.max(0, toNumber(row.quantity_to_ship));

        if (!config || !isKgUnit(unit)) {
            return {
                ...row,
                stock_now: stockNow,
                avg_sales_day: avgSalesDay,
                min_stock: rawMinStock,
                need_net: Math.max(0, toNumber(row.need_net)),
            };
        }

        const avgSalesDayDisplay = round1(avgSalesDay);
        const minStock = round1(avgSalesDayDisplay * 3);
        const needNet = round3(Math.max(0, minStock - stockNow));

        return {
            ...row,
            stock_now: stockNow,
            avg_sales_day: avgSalesDayDisplay,
            min_stock: minStock,
            need_net: needNet,
            packaging_enabled: true,
            packaging_mode: 'weight_with_estimated_packs',
            pack_weight_min_kg: config.pack_weight_min_kg,
            pack_weight_max_kg: config.pack_weight_max_kg,
            pack_weight_calc_kg: config.pack_weight_calc_kg,
            pack_zero_threshold_kg: config.pack_zero_threshold_kg,
            packs_rounding_mode: config.packs_rounding_mode,
            stock_now_packs_est: estimateFloridaPackagingPacks(stockNow, config),
            min_stock_packs_est: estimateFloridaPackagingPacks(minStock, config),
            need_net_packs_est: estimateFloridaPackagingPacks(needNet, config),
            quantity_to_ship_packs_est: estimateFloridaPackagingPacks(quantityToShip, config),
        };
    });
}
