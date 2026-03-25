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
    unit?: string;
    storeId: number;
    storeName: string;
    stockNow: number;
    minStock: number;
    avgSalesDay: number;
    needNet: number;
    bakedAtFactory: number;
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
    const parsed = safeNumber(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function safeFraction(value: unknown): number {
    const parsed = safeNumber(value);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : 0;
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

            const unitVal = typeof row.unit === 'string' ? row.unit : undefined;
            const res: NormalizedDistributionRow = {
                productId,
                productName,
                storeId,
                storeName,
                stockNow: Math.max(0, safeFraction(row.stock_now ?? row.current_stock)),
                minStock: Math.max(0, safeFraction(row.min_stock ?? row.norm_3_days)),
                avgSalesDay: Math.max(0, safeFraction(row.avg_sales_day ?? row.avg_sales)),
                needNet: Math.max(0, safeFraction(row.need_net ?? row.net_need)),
                bakedAtFactory: safeFraction(row.baked_at_factory),
            };
            if (unitVal !== undefined) res.unit = unitVal;
            return res;
        })
        .filter((row): row is NormalizedDistributionRow => row !== null);
}

export function createServiceRoleClient(): SupabaseClient {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing server-side Supabase configuration (SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
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
    productionQuantity: number
) {
    const productRows = rows.filter((row) => row.productId === productId);
    const isKg = productRows.length > 0 && productRows[0].unit === 'кг';
    const initialQuantity = isKg ? Math.max(0, safeFraction(productionQuantity)) : Math.max(0, Math.floor(productionQuantity));

    if (productRows.length === 0 || initialQuantity <= 0) {
        return {
            productId,
            originalQuantity: initialQuantity,
            distributed: {} as Record<number, number>,
            remaining: initialQuantity,
        };
    }

    const distribution: Record<number, number> = {};
    for (const row of productRows) {
        distribution[row.storeId] = 0;
    }

    let remaining = initialQuantity;

    if (isKg) {
        // Continuous Distribution for kg
        const needs = productRows
            .map((row) => {
                const need = Math.max(0, row.minStock - row.stockNow);
                return { storeId: row.storeId, need, avgSalesDay: row.avgSalesDay };
            })
            .filter((item) => item.need > 0);

        const totalNeed = needs.reduce((sum, item) => sum + item.need, 0);
        
        if (totalNeed > 0) {
            if (remaining <= totalNeed) {
                // Distribute proportionally to need
                for (const item of needs) {
                    const qty = safeFraction(item.need * (initialQuantity / totalNeed));
                    distribution[item.storeId] += qty;
                    remaining -= qty;
                }
            } else {
                // Fulfill all needs
                for (const item of needs) {
                    distribution[item.storeId] += item.need;
                    remaining -= item.need;
                }
            }
        }

        // Distribute any leftover remaining proportionally to avgSalesDay
        if (remaining > 0.001) {
            const sumAvgSales = productRows.reduce((sum, r) => sum + r.avgSalesDay, 0);
            const currentRemaining = remaining;
            if (sumAvgSales > 0) {
                for (const row of productRows) {
                    if (row.avgSalesDay > 0) {
                        const qty = safeFraction(currentRemaining * (row.avgSalesDay / sumAvgSales));
                        distribution[row.storeId] += qty;
                        remaining -= qty;
                    }
                }
            } else {
                // fallback if no avg sales: distribute equally
                const eqQty = safeFraction(currentRemaining / productRows.length);
                for (const row of productRows) {
                    distribution[row.storeId] += eqQty;
                    remaining -= eqQty;
                }
            }
        }
    } else {
        // Discrete Distribution for pieces
        const zeroStockRows = productRows
            .filter((row) => row.stockNow <= 0)
            .sort((a, b) => b.needNet - a.needNet);

        for (const row of zeroStockRows) {
            if (remaining <= 0) break;
            distribution[row.storeId] += 1;
            remaining -= 1;
        }

        if (remaining > 0) {
            const needs = productRows
                .map((row) => {
                    const effectiveStock = row.stockNow + (distribution[row.storeId] || 0);
                    const need = Math.max(0, row.minStock - effectiveStock);
                    return { storeId: row.storeId, need };
                })
                .filter((item) => item.need > 0);

            const totalNeed = needs.reduce((sum, item) => sum + item.need, 0);
            if (totalNeed > 0) {
                if (remaining >= totalNeed) {
                    for (const item of needs) {
                        const qty = Math.floor(item.need);
                        distribution[item.storeId] += qty;
                        remaining -= qty;
                    }
                } else {
                    const allocations = needs.map((item) => {
                        const raw = (item.need / totalNeed) * remaining;
                        const base = Math.floor(raw);
                        return { storeId: item.storeId, base, fraction: raw - base };
                    });

                    for (const allocation of allocations) {
                        if (allocation.base > 0) {
                            distribution[allocation.storeId] += allocation.base;
                            remaining -= allocation.base;
                        }
                    }

                    allocations.sort((a, b) => b.fraction - a.fraction);
                    for (const allocation of allocations) {
                        if (remaining <= 0) break;
                        distribution[allocation.storeId] += 1;
                        remaining -= 1;
                    }
                }
            }
        }

        if (remaining > 0) {
            const priority = [...productRows].sort((a, b) => {
                if (b.avgSalesDay !== a.avgSalesDay) return b.avgSalesDay - a.avgSalesDay;
                return b.needNet - a.needNet;
            });

            while (remaining > 0 && priority.length > 0) {
                for (const row of priority) {
                    if (remaining <= 0) break;
                    distribution[row.storeId] += 1;
                    remaining -= 1;
                }
            }
        }
    }

    // Cleanup rounding errors for remaining
    remaining = Math.max(0, safeFraction(remaining));
    // Cleanup negative zero or small rounding for distributed
    for (const key of Object.keys(distribution)) {
        distribution[Number(key)] = safeFraction(distribution[Number(key)]);
    }

    return {
        productId,
        originalQuantity: initialQuantity,
        distributed: distribution,
        remaining,
    };
}
