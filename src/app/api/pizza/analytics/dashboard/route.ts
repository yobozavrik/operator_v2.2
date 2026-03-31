import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { Logger } from '@/lib/logger';
import { fetchPizzaDistributionRowsByProduct } from '@/lib/pizza-distribution-read';

export const dynamic = 'force-dynamic';

type PizzaStatsRow = {
    product_name?: string | null;
    spot_name?: string | null;
    current_stock?: number | string | null;
    stock_now?: number | string | null;
    min_stock?: number | string | null;
    avg_sales_day?: number | string | null;
    need_net?: number | string | null;
    baked_at_factory?: number | string | null;
};

function safeNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').replace(/[^0-9.-]/g, '');
        return Number(normalized) || 0;
    }
    return 0;
}

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabase = createServiceRoleClient();

        const [statsRows, summaryResult] = await Promise.all([
            fetchPizzaDistributionRowsByProduct<PizzaStatsRow>(
                supabase,
                'product_id, product_name, spot_name, stock_now, min_stock, avg_sales_day, need_net, baked_at_factory',
            ),
            supabase
                .schema('pizza1')
                .from('v_pizza_summary_stats')
                .select('total_baked, total_norm, total_need')
                .single(),
        ]);

        const { data: summaryRow, error: summaryError } = summaryResult;

        if (summaryError) {
            Logger.error('[pizza analytics dashboard] summary failed', { error: summaryError.message });
        }

        const skuMap = new Map<string, {
            productName: string;
            totalStock: number;
            minStock: number;
            avgSales: number;
            needNet: number;
            bakedAtFactory: number;
            zeroStockStores: number;
            storesCovered: number;
        }>();

        const storeMap = new Map<string, {
            storeName: string;
            totalStock: number;
            minStock: number;
            needNet: number;
            avgSales: number;
            zeroStockSkus: number;
            skuCount: number;
        }>();

        const storeSkuRows: Array<{
            productName: string;
            storeName: string;
            stock: number;
            minStock: number;
            avgSales: number;
            needNet: number;
            fillRate: number;
            bakedAtFactory: number;
        }> = [];

        for (const row of statsRows || []) {
            const productName = String(row.product_name || '').trim();
            const storeName = String(row.spot_name || '').trim();
            const stock = safeNumber(row.current_stock ?? row.stock_now);
            const minStock = safeNumber(row.min_stock);
            const avgSales = safeNumber(row.avg_sales_day);
            const needNet = Math.max(0, safeNumber(row.need_net));
            const bakedAtFactory = Math.max(0, safeNumber(row.baked_at_factory));

            if (!productName || !storeName) continue;

            const skuEntry = skuMap.get(productName) || {
                productName,
                totalStock: 0,
                minStock: 0,
                avgSales: 0,
                needNet: 0,
                bakedAtFactory: 0,
                zeroStockStores: 0,
                storesCovered: 0,
            };

            skuEntry.totalStock += stock;
            skuEntry.minStock += minStock;
            skuEntry.avgSales += avgSales;
            skuEntry.needNet += needNet;
            skuEntry.bakedAtFactory = Math.max(skuEntry.bakedAtFactory, bakedAtFactory);
            skuEntry.storesCovered += 1;
            if (stock <= 0) skuEntry.zeroStockStores += 1;
            skuMap.set(productName, skuEntry);

            const storeEntry = storeMap.get(storeName) || {
                storeName,
                totalStock: 0,
                minStock: 0,
                needNet: 0,
                avgSales: 0,
                zeroStockSkus: 0,
                skuCount: 0,
            };

            storeEntry.totalStock += stock;
            storeEntry.minStock += minStock;
            storeEntry.needNet += needNet;
            storeEntry.avgSales += avgSales;
            storeEntry.skuCount += 1;
            if (stock <= 0) storeEntry.zeroStockSkus += 1;
            storeMap.set(storeName, storeEntry);

            storeSkuRows.push({
                productName,
                storeName,
                stock,
                minStock,
                avgSales,
                needNet,
                fillRate: minStock > 0 ? (stock / minStock) * 100 : 0,
                bakedAtFactory,
            });
        }

        const skuRows = Array.from(skuMap.values())
            .map((item) => {
                const targetStock = Math.max(item.minStock, item.avgSales * 3);
                const gapToTarget = Math.max(0, targetStock - item.totalStock);
                const productionGap = Math.max(0, gapToTarget - item.bakedAtFactory);
                const coverageDays = item.avgSales > 0 ? item.totalStock / item.avgSales : null;
                const riskIndex = item.minStock > 0
                    ? Math.round(item.avgSales * (item.needNet / item.minStock) * 100)
                    : 0;

                return {
                    ...item,
                    targetStock,
                    gapToTarget,
                    productionGap,
                    coverageDays,
                    riskIndex,
                };
            })
            .sort((a, b) => b.needNet - a.needNet || b.avgSales - a.avgSales);

        const storeRows = Array.from(storeMap.values())
            .map((item) => ({
                ...item,
                fillRate: item.minStock > 0 ? (item.totalStock / item.minStock) * 100 : 0,
            }))
            .sort((a, b) => b.needNet - a.needNet || a.fillRate - b.fillRate);

        const totalStock = skuRows.reduce((sum, item) => sum + item.totalStock, 0);
        const totalMinStock = Number(summaryRow?.total_norm || skuRows.reduce((sum, item) => sum + item.minStock, 0));
        const totalNeed = Number(summaryRow?.total_need || skuRows.reduce((sum, item) => sum + item.needNet, 0));
        const totalBaked = Number(summaryRow?.total_baked || skuRows.reduce((sum, item) => sum + item.bakedAtFactory, 0));
        const fillIndex = totalMinStock > 0 ? (totalStock / totalMinStock) * 100 : 0;
        const zeroStockStores = storeRows.reduce((sum, item) => sum + item.zeroStockSkus, 0);

        return NextResponse.json({
            generatedAt: new Date().toISOString(),
            overview: {
                totalSkus: skuRows.length,
                totalStores: storeRows.length,
                totalStock,
                totalMinStock,
                totalNeed,
                totalBaked,
                fillIndex,
                zeroStockStores,
            },
            sku: skuRows,
            stores: storeRows,
            storeSku: storeSkuRows.sort((a, b) => b.needNet - a.needNet || b.avgSales - a.avgSales),
            planVsFact: skuRows
                .map((item) => ({
                    productName: item.productName,
                    bakedAtFactory: item.bakedAtFactory,
                    avgSales: item.avgSales,
                    targetStock: item.targetStock,
                    gapToTarget: item.gapToTarget,
                    productionGap: item.productionGap,
                    coverageDays: item.coverageDays,
                }))
                .sort((a, b) => b.productionGap - a.productionGap || b.gapToTarget - a.gapToTarget)
                .slice(0, 12),
            signals: {
                topRisk: [...skuRows].sort((a, b) => b.riskIndex - a.riskIndex).slice(0, 6),
                topNeed: skuRows.slice(0, 6),
                topOosStores: [...storeRows].sort((a, b) => b.zeroStockSkus - a.zeroStockSkus).slice(0, 6),
            },
        });
    } catch (error) {
        Logger.error('[pizza analytics dashboard] error', {
            error: error instanceof Error ? error.message : JSON.stringify(error),
        });
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
