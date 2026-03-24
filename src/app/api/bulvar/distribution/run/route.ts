import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { syncBranchProductionFromPoster } from '@/lib/branch-production-sync';
import { syncBulvarCatalogFromPoster } from '@/lib/bulvar-catalog';
import { syncBulvarStocksFromEdge } from '@/lib/bulvar-stock-sync';
import {
    applyBulvarPackagingConfigToRows,
    fetchBulvarExactStocks,
    fetchBulvarPackagingConfig,
    type BulvarPackagingConfig,
} from '@/lib/bulvar-packaging';

export const dynamic = 'force-dynamic';

function getBulvarCronSecret(): string {
    return process.env.BULVAR_CRON_SECRET || process.env.CRON_SECRET || '';
}

function getCronSecretFromRequest(request: Request): string {
    const headerSecret = request.headers.get('x-cron-secret');
    if (headerSecret) return headerSecret;
    const authHeader = request.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || '';
}

function secretsEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a || '', 'utf8');
    const bBuf = Buffer.from(b || '', 'utf8');
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
}

function toPositiveInt(value: unknown): number {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.max(0, Math.floor(raw));
}

function toNonNegativeNumber(value: unknown): number {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return raw;
}

function round3(value: number): number {
    return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function floorToQuantum(value: number, quantum: number): number {
    if (quantum <= 0) return 0;
    const safe = Math.max(0, value);
    return round3(Math.floor((safe + 1e-9) / quantum) * quantum);
}

async function countTodayDistributionRows(supabaseAdmin: SupabaseClient): Promise<number> {
    const { count, error } = await supabaseAdmin
        .schema('bulvar1')
        .from('v_bulvar_today_distribution')
        .select('id', { count: 'exact', head: true });

    if (error) return 0;
    return Number(count || 0);
}

function kyivBusinessDate(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Kyiv',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
}

type BulvarProductionRow = {
    product_id: unknown;
    product_name: unknown;
    baked_at_factory: unknown;
};

type BulvarStatRow = {
    product_id: unknown;
    spot_id: unknown;
    spot_name: unknown;
    unit: unknown;
    avg_sales_day: unknown;
    min_stock: unknown;
    stock_now: unknown;
};

async function fetchBulvarStatRowsWithFallback(
    supabaseAdmin: SupabaseClient,
    productId: number
): Promise<{ data: BulvarStatRow[] | null; errorMessage?: string }> {
    const views = [
        'v_bulvar_distribution_stats',
        'v_bulvar_distribution_stats_catalog_14d_x3',
        'v_bulvar_distribution_stats_catalog_14d',
    ];

    const errors: string[] = [];

    for (const viewName of views) {
        const { data, error } = await supabaseAdmin
            .schema('bulvar1')
            .from(viewName)
            .select('product_id, spot_id, spot_name, unit, avg_sales_day, min_stock, stock_now')
            .eq('product_id', productId);

        if (!error) {
            return { data: (data || []) as BulvarStatRow[] };
        }

        errors.push(`${viewName}: ${error.message}`);
    }

    return {
        data: null,
        errorMessage: errors.join(' | '),
    };
}

type CalcSpot = {
    spotId: number;
    spotName: string;
    avgSales: number;
    minStock: number;
    stockNow: number;
    finalQty: number;
};

function distributeProportionally(
    spots: CalcSpot[],
    needs: number[],
    pool: number,
    quantum: number
): number {
    const totalNeed = needs.reduce((acc, n) => acc + (n > 0 ? n : 0), 0);
    if (totalNeed <= 0 || pool <= 0) return pool;

    if (pool < totalNeed) {
        const k = pool / totalNeed;
        let used = 0;
        for (let i = 0; i < spots.length; i += 1) {
            const add = floorToQuantum(Math.max(needs[i] || 0, 0) * k, quantum);
            if (add > 0) {
                spots[i].finalQty = round3(spots[i].finalQty + add);
                used += add;
            }
        }
        let remainder = round3(pool - used);
        if (remainder >= quantum) {
            const ranked = spots
                .map((s, i) => ({ i, need: Math.max(needs[i] || 0, 0), avgSales: s.avgSales, spotName: s.spotName }))
                .filter((x) => x.need > 0)
                .sort((a, b) => (b.need - a.need) || (b.avgSales - a.avgSales) || a.spotName.localeCompare(b.spotName));
            while (remainder >= quantum && ranked.length > 0) {
                for (const row of ranked) {
                    if (remainder < quantum) break;
                    spots[row.i].finalQty = round3(spots[row.i].finalQty + quantum);
                    remainder = round3(remainder - quantum);
                }
            }
        }
        return 0;
    }

    for (let i = 0; i < spots.length; i += 1) {
        const add = round3(Math.max(needs[i] || 0, 0));
        if (add > 0) {
            spots[i].finalQty = round3(spots[i].finalQty + add);
        }
    }
    return round3(pool - totalNeed);
}

function allocateAllProduction(
    spots: CalcSpot[],
    poolInput: number,
    options: { quantum: number; zeroStockTopup: number; maxMultiplier: number }
): { spots: CalcSpot[]; warehouseLeft: number } {
    const { quantum, zeroStockTopup, maxMultiplier } = options;
    let pool = round3(Math.max(0, poolInput));
    if (pool <= 0 || spots.length === 0) return { spots, warehouseLeft: pool };

    const zeroStock = spots
        .map((s, i) => ({ i, stockNow: s.stockNow, avgSales: s.avgSales, spotName: s.spotName }))
        .filter((x) => x.stockNow <= 0)
        .sort((a, b) => (b.avgSales - a.avgSales) || a.spotName.localeCompare(b.spotName));

    if (zeroStock.length > 0 && zeroStockTopup > 0) {
        for (const z of zeroStock) {
            if (pool < quantum) break;
            const add = floorToQuantum(Math.min(zeroStockTopup, pool), quantum);
            if (add < quantum) continue;
            spots[z.i].finalQty = round3(spots[z.i].finalQty + add);
            pool = round3(pool - add);
        }
    }

    if (pool > 0) {
        const needs = spots.map((s) => Math.max(0, s.minStock - (s.stockNow + s.finalQty)));
        pool = distributeProportionally(spots, needs, pool, quantum);
    }

    let multiplier = 2;
    while (pool > 0) {
        const needs = spots.map((s) => Math.max(0, (s.minStock * multiplier) - (s.stockNow + s.finalQty)));
        const totalNeed = needs.reduce((acc, n) => acc + n, 0);
        if (totalNeed <= 0) {
            multiplier += 1;
            if (multiplier > maxMultiplier) break;
            continue;
        }
        pool = distributeProportionally(spots, needs, pool, quantum);
        multiplier += 1;
        if (multiplier > maxMultiplier) break;
    }

    if (pool > 0) {
        const weights = spots.map((s) => Math.max(quantum, round3(s.avgSales)));
        pool = distributeProportionally(spots, weights, pool, quantum);
    }

    return { spots, warehouseLeft: round3(pool) };
}

function isKgUnit(value: unknown): boolean {
    const unit = String(value || '').trim().toLowerCase();
    return unit === 'kg' || unit === 'кг';
}

export async function POST(request: Request) {
    const cronSecret = getBulvarCronSecret();
    const requestSecret = getCronSecretFromRequest(request);
    const isCronRequest = Boolean(cronSecret) && secretsEqual(cronSecret || '', requestSecret);

    if (!isCronRequest) {
        const auth = await requireAuth();
        if (auth.error) return auth.error;
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceKey || !supabaseUrl) {
        return NextResponse.json({ error: 'Server Config Error: Missing Supabase credentials' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false }
    });

    try {
        await syncBulvarCatalogFromPoster(supabaseAdmin).catch(() => []);
        const productionSync = await syncBranchProductionFromPoster(supabaseAdmin, 'bulvar1', 22);
        try {
            await syncBulvarStocksFromEdge(supabaseAdmin);
        } catch {
            // Keep SQL distribution path resilient: it can still run on the last persisted stock snapshot.
        }

        const batchId = crypto.randomUUID();
        const businessDate = kyivBusinessDate();

        const { error: clearError } = await supabaseAdmin
            .schema('bulvar1')
            .from('distribution_results')
            .delete()
            .eq('business_date', businessDate);

        if (clearError) {
            return NextResponse.json({
                error: 'Bulvar SQL distribution failed',
                message: clearError.message,
                code: 'SQL_DISTRIBUTION_ERROR',
            }, { status: 500 });
        }

        const { data: prodRows, error: prodError } = await supabaseAdmin
            .schema('bulvar1')
            .from('v_bulvar_production_only')
            .select('product_id, product_name, baked_at_factory')
            .gt('baked_at_factory', 0);

        if (prodError) {
            return NextResponse.json({
                error: 'Bulvar SQL distribution failed',
                message: prodError.message,
                code: 'SQL_DISTRIBUTION_ERROR',
            }, { status: 500 });
        }

        const productionByProduct = new Map<number, { productName: string; pool: number }>();
        for (const row of (prodRows || []) as BulvarProductionRow[]) {
            const productId = toPositiveInt(row.product_id);
            const baked = round3(toNonNegativeNumber(row.baked_at_factory));
            if (productId <= 0 || baked <= 0) continue;
            const productName = String(row.product_name ?? '');
            const prev = productionByProduct.get(productId);
            if (prev) {
                prev.pool += baked;
                if (!prev.productName && productName) prev.productName = productName;
            } else {
                productionByProduct.set(productId, { productName, pool: baked });
            }
        }

        const allInserts: Array<{
            product_id: number;
            product_name: string;
            spot_id: number | null;
            spot_name: string;
            quantity_to_ship: number;
            calculation_batch_id: string;
            business_date: string;
            delivery_status: string;
        }> = [];

        const packagingConfigMap = await fetchBulvarPackagingConfig(
            supabaseAdmin,
            Array.from(productionByProduct.keys())
        ).catch(() => new Map<number, BulvarPackagingConfig>());
        const exactStockMap = await fetchBulvarExactStocks(
            supabaseAdmin,
            Array.from(packagingConfigMap.keys())
        ).catch(() => new Map<string, number>());

        for (const [productId, prod] of productionByProduct) {
            const { data: statRows, errorMessage } = await fetchBulvarStatRowsWithFallback(
                supabaseAdmin,
                productId
            );

            if (!statRows) {
                return NextResponse.json({
                    error: 'Bulvar SQL distribution failed',
                    message: errorMessage || `Failed to load stats rows for product_id=${productId}`,
                    code: 'SQL_DISTRIBUTION_ERROR',
                }, { status: 500 });
            }

            const normalizedRows = applyBulvarPackagingConfigToRows(
                ((statRows || []) as BulvarStatRow[]).map((row) => ({
                    ...row,
                    product_id: productId,
                })),
                packagingConfigMap,
                exactStockMap
            );

            const packagingConfig = packagingConfigMap.get(productId);
            const isPackagingKgProduct =
                Boolean(packagingConfig) &&
                normalizedRows.some((row) => isKgUnit(row.unit));

            const spots: CalcSpot[] = normalizedRows
                .map((r) => ({
                    spotId: toPositiveInt(r.spot_id),
                    spotName: String(r.spot_name ?? ''),
                    avgSales: Math.max(0, Number(r.avg_sales_day) || 0),
                    minStock: Math.max(0, Number(r.min_stock) || 0),
                    stockNow: Math.max(0, Number(r.stock_now) || 0),
                    finalQty: 0,
                }))
                .filter((s) => s.spotId > 0 && s.spotName);

            const allocationOptions = isPackagingKgProduct
                ? {
                    quantum: 0.01,
                    zeroStockTopup: Math.max(0.01, Number(packagingConfig?.pack_weight_calc_kg || 0.4)),
                    maxMultiplier: 4,
                }
                : {
                    quantum: 1,
                    zeroStockTopup: 1,
                    maxMultiplier: 1000,
                };

            const { spots: allocated, warehouseLeft } = allocateAllProduction(spots, prod.pool, allocationOptions);

            for (const s of allocated) {
                if (s.finalQty <= 0) continue;
                allInserts.push({
                    product_id: productId,
                    product_name: prod.productName,
                    spot_id: s.spotId,
                    spot_name: s.spotName,
                    quantity_to_ship: round3(s.finalQty),
                    calculation_batch_id: batchId,
                    business_date: businessDate,
                    delivery_status: 'pending',
                });
            }

            if (warehouseLeft > 0) {
                allInserts.push({
                    product_id: productId,
                    product_name: prod.productName,
                    spot_id: null,
                    spot_name: 'РћСЃС‚Р°С‚РѕРє РЅР° РЎРєР»Р°РґРµ',
                    quantity_to_ship: round3(warehouseLeft),
                    calculation_batch_id: batchId,
                    business_date: businessDate,
                    delivery_status: 'delivered',
                });
            }
        }

        if (allInserts.length > 0) {
            const chunkSize = 1000;
            for (let i = 0; i < allInserts.length; i += chunkSize) {
                const chunk = allInserts.slice(i, i + chunkSize);
                const { error: insertError } = await supabaseAdmin
                    .schema('bulvar1')
                    .from('distribution_results')
                    .insert(chunk);
                if (insertError) {
                    return NextResponse.json({
                        error: 'Bulvar SQL distribution failed',
                        message: insertError.message,
                        code: 'SQL_DISTRIBUTION_ERROR',
                    }, { status: 500 });
                }
            }
        }

        const todayRows = await countTodayDistributionRows(supabaseAdmin);
        if (todayRows <= 0 && productionSync.items.length > 0) {
            return NextResponse.json({
                error: 'Bulvar SQL distribution produced 0 rows',
                code: 'EMPTY_SQL_RESULT',
            }, { status: 500 });
        }

        const { data: batchRows, error: summaryError } = await supabaseAdmin
            .schema('bulvar1')
            .from('distribution_results')
            .select('product_name, quantity_to_ship')
            .eq('calculation_batch_id', batchId);

        if (summaryError) {
            throw summaryError;
        }

        const safeRows = batchRows || [];
        const productsProcessed = new Set(safeRows.map(row => row.product_name)).size;
        const totalKg = round3(safeRows.reduce((acc, row) => acc + (Number(row.quantity_to_ship) || 0), 0));

        return NextResponse.json({
            success: true,
            batch_id: batchId,
            mode: 'sql_only',
            products_processed: productsProcessed,
            total_qty: totalKg,
            message: `Batch: ${String(batchId).slice(0, 8)} | РџРѕР·РёС†С–Р№: ${productsProcessed} | РћР±СЃСЏРі: ${totalKg}`
        });

    } catch (err: unknown) {
        return NextResponse.json({
            error: err instanceof Error ? err.message : 'Unknown distribution error',
        }, { status: 500 });
    }
}


