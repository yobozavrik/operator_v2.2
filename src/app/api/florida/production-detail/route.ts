import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { estimateFloridaPackagingPacks, fetchFloridaPackagingConfig } from '@/lib/florida-packaging';

export const dynamic = 'force-dynamic';

interface ProductionOnlyRow {
    product_id: number;
    product_name: string;
    baked_at_factory: number;
}

interface HistoricalRow {
    product_id: number;
    product_name: string;
    total_qty_180d: number;
    prod_days: number;
    avg_qty_per_prod_day: number;
    last_manufacture_at: string | null;
}

interface MetricsRow {
    product_id: number;
    product_name: string;
    unit?: string | null;
    stock_now: number;
    min_stock: number;
    avg_sales_day: number;
    need_net: number;
}

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json(
                { error: 'Server Config Error', code: 'MISSING_SUPABASE_CONFIG' },
                { status: 500 }
            );
        }

        const supabase = createSupabaseClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false },
        });

        const [histRes, todayRes, metricsRes] = await Promise.all([
            supabase
                .schema('florida1')
                .from('production_180d_products')
                .select('product_id, product_name, total_qty_180d, prod_days, avg_qty_per_prod_day, last_manufacture_at')
                .order('total_qty_180d', { ascending: false }),
            supabase
                .schema('florida1')
                .from('v_florida_production_only')
                .select('product_id, product_name, baked_at_factory'),
            supabase
                .schema('florida1')
                .from('v_florida_distribution_stats')
                .select('product_id, product_name, unit, stock_now, min_stock, avg_sales_day, need_net'),
        ]);

        if (histRes.error) {
            Logger.error('[florida Production Detail] 180d query error', { error: histRes.error.message });
            return NextResponse.json({
                error: 'Query failed',
                message: histRes.error.message,
                code: 'DB_ERROR',
            }, { status: 500 });
        }

        if (todayRes.error) {
            Logger.error('[florida Production Detail] today query error', { error: todayRes.error.message });
            return NextResponse.json({
                error: 'Query failed',
                message: todayRes.error.message,
                code: 'DB_ERROR',
            }, { status: 500 });
        }

        if (metricsRes.error) {
            Logger.error('[florida Production Detail] metrics query error', { error: metricsRes.error.message });
            return NextResponse.json({
                error: 'Query failed',
                message: metricsRes.error.message,
                code: 'DB_ERROR',
            }, { status: 500 });
        }

        const histData = (histRes.data || []) as HistoricalRow[];
        const todayData = (todayRes.data || []) as ProductionOnlyRow[];
        const metricsData = (metricsRes.data || []) as MetricsRow[];

        const todayMap = new Map<number, ProductionOnlyRow>();
        todayData.forEach((row) => {
            if (row?.product_id == null) return;
            todayMap.set(Number(row.product_id), row);
        });

        const metricsMap = new Map<number, { unit: string; stock_now: number; min_stock: number; avg_sales_day: number; need_net: number }>();
        metricsData.forEach((row) => {
            const productId = Number(row.product_id);
            if (!Number.isFinite(productId)) return;
            const current = metricsMap.get(productId) || { unit: 'шт', stock_now: 0, min_stock: 0, avg_sales_day: 0, need_net: 0 };
            const unit = String(row.unit || '').trim();
            if (unit) current.unit = unit;
            current.stock_now += Number(row.stock_now || 0);
            current.min_stock += Number(row.min_stock || 0);
            current.avg_sales_day += Number(row.avg_sales_day || 0);
            current.need_net += Number(row.need_net || 0);
            metricsMap.set(productId, current);
        });

        const historicalByProduct = new Map<number, HistoricalRow>();
        histData.forEach((row) => {
            const productId = Number(row.product_id);
            if (!Number.isFinite(productId) || productId <= 0) return;
            historicalByProduct.set(productId, row);
        });

        todayMap.forEach((todayRow, productId) => {
            if (historicalByProduct.has(productId)) return;
            historicalByProduct.set(productId, {
                product_id: productId,
                product_name: todayRow.product_name,
                total_qty_180d: 0,
                prod_days: 0,
                avg_qty_per_prod_day: 0,
                last_manufacture_at: null,
            });
        });

        const productIds = Array.from(
            new Set(
                Array.from(historicalByProduct.keys())
                    .map((id) => Number(id))
                    .filter((id) => Number.isFinite(id) && id > 0)
            )
        );
        const packagingConfigMap = await fetchFloridaPackagingConfig(supabase, productIds).catch(() => new Map());

        const isKgUnit = (value: unknown): boolean => {
            const unit = String(value || '').trim().toLowerCase();
            return unit === 'kg' || unit === 'кг';
        };

        const merged = Array.from(historicalByProduct.values()).map((row) => {
            const productId = Number(row.product_id);
            const today = todayMap.get(productId);
            const metrics = metricsMap.get(productId);
            const unit = String(metrics?.unit || 'шт').trim() || 'шт';
            const packagingConfig = packagingConfigMap.get(productId);
            const packagingEnabled = Boolean(packagingConfig && isKgUnit(unit));
            const bakedAtFactory = Number(today?.baked_at_factory || 0);
            const stockNow = Number(metrics?.stock_now || 0);
            const minStock = Number(metrics?.min_stock || 0);
            const needNet = Number(metrics?.need_net || 0);

            return {
                product_id: productId,
                product_name: row.product_name,
                unit,
                baked_at_factory: bakedAtFactory,
                total_qty_180d: Number(row.total_qty_180d || 0),
                prod_days: Number(row.prod_days || 0),
                avg_qty_per_prod_day: Number(row.avg_qty_per_prod_day || 0),
                last_manufacture_at: row.last_manufacture_at,
                stock_now: stockNow,
                min_stock: minStock,
                avg_sales_day: Number(metrics?.avg_sales_day || 0),
                need_net: needNet,
                packaging_enabled: packagingEnabled,
                stock_now_packs_est: packagingEnabled ? estimateFloridaPackagingPacks(stockNow, packagingConfig!) : 0,
                min_stock_packs_est: packagingEnabled ? estimateFloridaPackagingPacks(minStock, packagingConfig!) : 0,
                need_net_packs_est: packagingEnabled ? estimateFloridaPackagingPacks(needNet, packagingConfig!) : 0,
                baked_at_factory_packs_est: packagingEnabled ? estimateFloridaPackagingPacks(bakedAtFactory, packagingConfig!) : 0,
            };
        });

        merged.sort((a, b) => {
            if (b.baked_at_factory !== a.baked_at_factory) return b.baked_at_factory - a.baked_at_factory;
            return b.total_qty_180d - a.total_qty_180d;
        });

        return NextResponse.json(merged);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        Logger.error('[florida Production Detail] Critical Error', { error: message });
        return NextResponse.json({
            error: 'Internal Server Error',
            message,
            code: 'INTERNAL_ERROR',
        }, { status: 500 });
    }
}
