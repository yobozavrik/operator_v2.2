import { SupabaseClient, createClient } from '@supabase/supabase-js';

export type BranchName = 'bulvar' | 'florida';

export interface BranchConfig {
    name: BranchName;
    schema: string;
    distributionView: string;
    shopParam: string;
}

export const BRANCH_CONFIGS: Record<BranchName, BranchConfig> = {
    bulvar: {
        name: 'bulvar',
        schema: 'bulvar1',
        distributionView: 'v_bulvar_distribution_stats_x3',
        shopParam: 'bulvar',
    },
    florida: {
        name: 'florida',
        schema: 'florida1',
        distributionView: 'v_florida_distribution_stats',
        shopParam: 'florida',
    },
};

type RawRow = Record<string, unknown>;

export interface NormalizedDistributionRow {
    productId: number;
    productName: string;
    storeId: number;
    storeName: string;
    unit?: string;
    stockNow: number;
    minStock: number;
    avgSalesDay: number;
    needNet: number;
    bakedAtFactory: number;
}

export interface BranchDistributionOptions {
    unit?: string;
    quantityScale?: number;
}

function safeNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').trim();
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function safeInteger(value: unknown): number {
    const parsed = Math.trunc(safeNumber(value));
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeUnit(unit?: string): string {
    return String(unit || '').trim().toLowerCase();
}

function isKgUnit(unit?: string): boolean {
    const normalized = normalizeUnit(unit);
    return normalized === 'kg' || normalized === 'кг';
}

function getQuantityScale(unit?: string, overrideScale?: number): number {
    if (Number.isFinite(overrideScale) && Number(overrideScale) > 0) {
        return Math.max(1, Math.trunc(Number(overrideScale)));
    }
    return isKgUnit(unit) ? 100 : 1;
}

function toScaledUnits(value: unknown, scale: number): number {
    const numeric = Math.max(0, safeNumber(value));
    return Math.max(0, Math.round(numeric * scale));
}

function fromScaledUnits(value: number, scale: number): number {
    const safe = Math.max(0, Math.round(value));
    if (scale <= 1) return safe;
    return Number((safe / scale).toFixed(2));
}

function getStoreName(row: RawRow): string {
    const name = row.spot_name ?? row.store_name ?? row.shop_name;
    if (typeof name === 'string' && name.trim()) return name.trim();
    return 'Unknown';
}

function getExplicitStoreId(row: RawRow): number {
    const candidate = row.store_id ?? row.spot_id ?? row.code;
    const id = safeInteger(candidate);
    return id > 0 ? id : 0;
}

function normalizeDistributionRows(rows: RawRow[]): NormalizedDistributionRow[] {
    const storeIdByName = new Map<string, number>();
    const explicitStoreIds = rows
        .map((row) => getExplicitStoreId(row))
        .filter((id) => id > 0);

    let nextGeneratedId = explicitStoreIds.length > 0 ? Math.max(...explicitStoreIds) + 1 : 1;

    for (const row of rows) {
        const storeName = getStoreName(row);
        const explicitId = getExplicitStoreId(row);
        if (explicitId > 0) {
            storeIdByName.set(storeName, explicitId);
        }
    }

    const sortedNames = Array.from(new Set(rows.map((row) => getStoreName(row)))).sort((a, b) =>
        a.localeCompare(b)
    );

    for (const name of sortedNames) {
        if (!storeIdByName.has(name)) {
            storeIdByName.set(name, nextGeneratedId++);
        }
    }

    return rows
        .map((row) => {
            const productId = safeInteger(row.product_id);
            if (productId <= 0) return null;

            const productNameRaw = row.product_name;
            const productName =
                typeof productNameRaw === 'string' && productNameRaw.trim()
                    ? productNameRaw.trim()
                    : `Product ${productId}`;

            const storeName = getStoreName(row);
            const storeId = storeIdByName.get(storeName) ?? 0;
            if (storeId <= 0) return null;

            return {
                productId,
                productName,
                storeId,
                storeName,
                unit: typeof row.unit === 'string' && row.unit.trim() ? row.unit.trim() : undefined,
                stockNow: Math.max(0, safeNumber(row.stock_now ?? row.current_stock)),
                minStock: Math.max(0, safeNumber(row.min_stock ?? row.norm_3_days)),
                avgSalesDay: Math.max(0, safeNumber(row.avg_sales_day ?? row.avg_sales)),
                needNet: Math.max(0, safeNumber(row.need_net ?? row.net_need)),
                bakedAtFactory: safeNumber(row.baked_at_factory),
            } satisfies NormalizedDistributionRow;
        })
        .filter((row) => row !== null) as NormalizedDistributionRow[];
}

export function createServiceRoleClient(): SupabaseClient {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase configuration');
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
    });
}

export async function fetchBranchRows(
    client: SupabaseClient,
    config: BranchConfig,
    select = '*'
): Promise<NormalizedDistributionRow[]> {
    const { data, error } = await client
        .schema(config.schema)
        .from(config.distributionView)
        .select(select);

    if (error) {
        throw new Error(error.message);
    }

    return normalizeDistributionRows((data || []) as unknown as RawRow[]);
}

export function coercePositiveInt(raw: string | null, fallback: number, min = 1, max = 30): number {
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

export function buildBranchOrderPlan(rows: NormalizedDistributionRow[], days: number) {
    const grouped = new Map<string, { stock: number; min: number; avg: number; need: number }>();

    for (const row of rows) {
        const key = row.productName;
        const current = grouped.get(key) ?? { stock: 0, min: 0, avg: 0, need: 0 };
        current.stock += row.stockNow;
        current.min += row.minStock;
        current.avg += row.avgSalesDay;
        current.need += row.needNet;
        grouped.set(key, current);
    }

    const plan: Array<{
        p_day: number;
        p_name: string;
        p_stock: number;
        p_order: number;
        p_min: number;
        p_avg: number;
    }> = [];

    const products = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [productName, metrics] of products) {
        for (let day = 1; day <= days; day += 1) {
            const plannedOrder = Math.max(0, Math.ceil(metrics.need + metrics.avg * (day - 1)));
            plan.push({
                p_day: day,
                p_name: productName,
                p_stock: Math.round(metrics.stock),
                p_order: plannedOrder,
                p_min: Math.round(metrics.min),
                p_avg: Number(metrics.avg.toFixed(2)),
            });
        }
    }

    return plan.sort((a, b) => {
        if (a.p_day !== b.p_day) return a.p_day - b.p_day;
        return b.p_order - a.p_order;
    });
}

export function buildBranchAnalytics(rows: NormalizedDistributionRow[], topNameKey: string) {
    const byProduct = new Map<string, { stock: number; min: number; need: number }>();

    let currentStock = 0;
    let totalNeed = 0;
    let totalTarget = 0;
    let criticalPositions = 0;

    for (const row of rows) {
        currentStock += row.stockNow;
        totalNeed += row.needNet;
        totalTarget += row.minStock;
        if (row.stockNow <= 0) criticalPositions += 1;

        const current = byProduct.get(row.productName) ?? { stock: 0, min: 0, need: 0 };
        current.stock += row.stockNow;
        current.min += row.minStock;
        current.need += row.needNet;
        byProduct.set(row.productName, current);
    }

    const top5 = Array.from(byProduct.entries())
        .map(([productName, values]) => {
            const riskIndex = values.min > 0 ? (values.need / values.min) * 100 : values.need * 100;
            return {
                [topNameKey]: productName,
                shop_stock: Math.round(values.stock),
                risk_index: Number(riskIndex.toFixed(1)),
            };
        })
        .sort((a, b) => Number(b.risk_index) - Number(a.risk_index))
        .slice(0, 5);

    const fillLevel = totalTarget > 0 ? ((currentStock / totalTarget) * 100).toFixed(1) : '0.0';

    return {
        kpi: {
            currentStock: Math.round(currentStock),
            totalNeed: Math.round(totalNeed),
            totalTarget: Math.round(totalTarget),
            criticalPositions,
            fillLevel,
        },
        top5,
    };
}

export function calculateBranchDistribution(
    rows: NormalizedDistributionRow[],
    productId: number,
    productionQuantity: number,
    options: BranchDistributionOptions = {}
) {
    const productRows = rows.filter((row) => row.productId === productId);
    const quantityScale = getQuantityScale(options.unit || productRows[0]?.unit, options.quantityScale);
    const initialQuantity = toScaledUnits(productionQuantity, quantityScale);

    if (productRows.length === 0 || initialQuantity <= 0) {
        return {
            productId,
            originalQuantity: fromScaledUnits(initialQuantity, quantityScale),
            distributed: {} as Record<number, number>,
            remaining: fromScaledUnits(initialQuantity, quantityScale),
        };
    }

    const distributionMinor: Record<number, number> = {};
    for (const row of productRows) {
        distributionMinor[row.storeId] = 0;
    }

    let remaining = initialQuantity;

    // Step 1: each zero-stock store receives one unit first.
    const zeroStockRows = productRows
        .filter((row) => toScaledUnits(row.stockNow, quantityScale) <= 0)
        .sort((a, b) => b.needNet - a.needNet);

    for (const row of zeroStockRows) {
        if (remaining <= 0) break;
        distributionMinor[row.storeId] += 1;
        remaining -= 1;
    }

    // Step 2: fill deficits proportionally based on remaining need.
    if (remaining > 0) {
        const needs = productRows
            .map((row) => {
                const effectiveStock = toScaledUnits(row.stockNow, quantityScale) + (distributionMinor[row.storeId] || 0);
                const need = Math.max(0, toScaledUnits(row.minStock, quantityScale) - effectiveStock);
                return { storeId: row.storeId, need };
            })
            .filter((item) => item.need > 0);

        const totalNeed = needs.reduce((sum, item) => sum + item.need, 0);
        if (totalNeed > 0) {
            if (remaining >= totalNeed) {
                for (const item of needs) {
                    distributionMinor[item.storeId] += item.need;
                    remaining -= item.need;
                }
            } else {
                const allocations = needs.map((item) => {
                    const raw = (item.need / totalNeed) * remaining;
                    const base = Math.floor(raw);
                    return {
                        storeId: item.storeId,
                        base,
                        fraction: raw - base,
                    };
                });

                for (const allocation of allocations) {
                    if (allocation.base > 0) {
                        distributionMinor[allocation.storeId] += allocation.base;
                        remaining -= allocation.base;
                    }
                }

                allocations.sort((a, b) => b.fraction - a.fraction);
                for (const allocation of allocations) {
                    if (remaining <= 0) break;
                    distributionMinor[allocation.storeId] += 1;
                    remaining -= 1;
                }
            }
        }
    }

    // Step 3: spread leftovers by demand priority.
    if (remaining > 0) {
        const priority = [...productRows].sort((a, b) => {
            if (b.avgSalesDay !== a.avgSalesDay) return b.avgSalesDay - a.avgSalesDay;
            return b.needNet - a.needNet;
        });

        while (remaining > 0 && priority.length > 0) {
            for (const row of priority) {
                if (remaining <= 0) break;
                distributionMinor[row.storeId] += 1;
                remaining -= 1;
            }
        }
    }

    const distribution: Record<number, number> = {};
    for (const [storeIdRaw, quantityMinor] of Object.entries(distributionMinor)) {
        const storeId = Number(storeIdRaw);
        if (!Number.isFinite(storeId) || storeId <= 0) continue;
        distribution[storeId] = fromScaledUnits(quantityMinor, quantityScale);
    }

    return {
        productId,
        originalQuantity: fromScaledUnits(initialQuantity, quantityScale),
        distributed: distribution,
        remaining: fromScaledUnits(remaining, quantityScale),
    };
}
