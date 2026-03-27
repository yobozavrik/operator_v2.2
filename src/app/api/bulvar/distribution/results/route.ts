import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyBulvarPackagingConfigToRows, fetchBulvarExactStocks, fetchBulvarPackagingConfig } from '@/lib/bulvar-packaging';
import { normalizeDistributionSpotName } from '@/lib/distribution-spot-name';

export const dynamic = 'force-dynamic';

type TodayDistributionRow = {
    product_name?: string | null;
    spot_name?: string | null;
    quantity_to_ship?: number | string | null;
    created_at?: string | null;
};

type DistributionStatRow = {
    product_id?: number | string | null;
    product_name?: string | null;
    spot_id?: number | string | null;
    spot_name?: string | null;
    unit?: string | null;
    stock_now?: number | string | null;
    min_stock?: number | string | null;
    avg_sales_day?: number | string | null;
    need_net?: number | string | null;
};

function safeNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value.replace(',', '.').trim());
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function normalizeKeyPart(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return NextResponse.json({ error: 'Server Config Error' }, { status: 500 });
    }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );

    try {
        const { data, error } = await supabaseAdmin
            .schema('bulvar1')
            .from('v_bulvar_today_distribution')
            .select('product_name, spot_name, quantity_to_ship, created_at')
            .order('product_name', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const todayRows = ((data || []) as TodayDistributionRow[]).map((row) => ({
            product_name: String(row.product_name || ''),
            spot_name: normalizeDistributionSpotName(row.spot_name),
            quantity_to_ship: Math.max(0, safeNumber(row.quantity_to_ship)),
            calc_time: row.created_at || null,
        }));

        const uniqueProductNames = Array.from(new Set(todayRows.map((row) => row.product_name).filter(Boolean)));
        if (uniqueProductNames.length === 0) {
            return NextResponse.json([]);
        }

        const { data: statRows, error: statError } = await supabaseAdmin
            .schema('bulvar1')
            .from('v_bulvar_distribution_stats')
            .select('product_id, product_name, spot_id, spot_name, unit, stock_now, min_stock, avg_sales_day, need_net')
            .in('product_name', uniqueProductNames);

        if (statError) {
            return NextResponse.json({ error: statError.message }, { status: 500 });
        }

        const statByNameAndSpot = new Map<string, DistributionStatRow>();
        for (const row of (statRows || []) as DistributionStatRow[]) {
            const key = `${normalizeKeyPart(row.product_name)}|${normalizeKeyPart(
                normalizeDistributionSpotName(row.spot_name)
            )}`;
            statByNameAndSpot.set(key, row);
        }

        const rowsForPackaging = todayRows.map((row) => {
            const stat = statByNameAndSpot.get(`${normalizeKeyPart(row.product_name)}|${normalizeKeyPart(row.spot_name)}`);
            return {
                product_id: stat?.product_id ?? 0,
                product_name: row.product_name,
                spot_id: stat?.spot_id ?? 0,
                spot_name: row.spot_name,
                unit: String(stat?.unit || 'шт'),
                stock_now: Math.max(0, safeNumber(stat?.stock_now)),
                min_stock: Math.max(0, safeNumber(stat?.min_stock)),
                avg_sales_day: Math.max(0, safeNumber(stat?.avg_sales_day)),
                need_net: Math.max(0, safeNumber(stat?.need_net)),
                quantity_to_ship: row.quantity_to_ship,
                calc_time: row.calc_time,
            };
        });

        const productIds = Array.from(
            new Set(
                rowsForPackaging
                    .map((row) => Number(row.product_id))
                    .filter((id) => Number.isFinite(id) && id > 0)
            )
        );

        const configMap = await fetchBulvarPackagingConfig(supabaseAdmin, productIds).catch(() => new Map());
        const exactStockMap = await fetchBulvarExactStocks(supabaseAdmin, Array.from(configMap.keys())).catch(() => new Map());

        const enrichedRows = applyBulvarPackagingConfigToRows(rowsForPackaging, configMap, exactStockMap);

        const responseRows = enrichedRows.map((row) => ({
            product_name: String(row.product_name || ''),
            spot_name: normalizeDistributionSpotName(row.spot_name),
            quantity_to_ship: Math.max(0, safeNumber(row.quantity_to_ship)),
            current_stock: Math.max(0, safeNumber(row.stock_now)),
            min_stock: Math.max(0, safeNumber(row.min_stock)),
            avg_sales: Math.max(0, safeNumber(row.avg_sales_day)),
            unit: String(row.unit || 'шт'),
            packaging_enabled: Boolean(row.packaging_enabled),
            quantity_to_ship_packs_est: Math.max(0, safeNumber(row.quantity_to_ship_packs_est)),
            stock_now_packs_est: Math.max(0, safeNumber(row.stock_now_packs_est)),
            min_stock_packs_est: Math.max(0, safeNumber(row.min_stock_packs_est)),
            calc_time: row.calc_time || null,
        }));

        return NextResponse.json(responseRows);
    } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
    }
}
