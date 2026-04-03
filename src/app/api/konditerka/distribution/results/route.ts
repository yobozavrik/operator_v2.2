import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { normalizeKonditerkaUnit } from '@/lib/konditerka-dictionary';
import {
    applyKonditerkaPackagingConfigToRows,
    fetchKonditerkaPackagingConfig,
} from '@/lib/konditerka-packaging';

export const dynamic = 'force-dynamic';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function kyivBusinessDate(offsetDays = 0): string {
    const base = new Date();
    if (offsetDays !== 0) {
        base.setDate(base.getDate() + offsetDays);
    }
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Kyiv',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(base);
    const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const month = parts.find((p) => p.type === 'month')?.value ?? '01';
    const day = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${year}-${month}-${day}`;
}

function resolveTargetDate(request: Request): string {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    if (dateParam && ISO_DATE_RE.test(dateParam)) return dateParam;
    return kyivBusinessDate();
}

function normalizeKey(value: unknown): string {
    return String(value || '')
        .toLowerCase()
        .replace(/["'«»]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function toSafeNumber(value: unknown): number {
    const raw = Number(value);
    if (Number.isFinite(raw)) return raw;
    if (typeof value === 'string') {
        const parsed = Number(value.replace(',', '.'));
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

export async function GET(request: Request) {
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
        const targetDate = resolveTargetDate(request);
        const [distributionRes, statsRes] = await Promise.all([
            supabaseAdmin
                .schema('konditerka1')
                .from('distribution_results')
                .select('id, product_name, spot_name, quantity_to_ship, calculation_batch_id, created_at, business_date')
                .eq('business_date', targetDate)
                .order('product_name', { ascending: true })
                .order('spot_name', { ascending: true }),
            supabaseAdmin
                .schema('konditerka1')
                .from('v_konditerka_distribution_stats')
                .select(
                    'product_id, product_name, spot_id, spot_name, stock_now, min_stock, avg_sales_day, need_net'
                ),
        ]);

        if (distributionRes.error) {
            console.error('Konditerka distribution read error:', distributionRes.error);
            return NextResponse.json({ error: distributionRes.error.message }, { status: 500 });
        }
        if (statsRes.error) {
            console.error('Konditerka stats read error:', statsRes.error);
            return NextResponse.json({ error: statsRes.error.message }, { status: 500 });
        }

        const statsMap = new Map<
            string,
            {
                product_id: number;
                spot_id: number;
                stock_now: number;
                min_stock: number;
                avg_sales_day: number;
                need_net: number;
            }
        >();

        for (const row of (statsRes.data || []) as Array<Record<string, unknown>>) {
            const key = `${normalizeKey(row.product_name)}::${normalizeKey(row.spot_name)}`;
            if (!key || key === '::') continue;
            if (statsMap.has(key)) continue;
            statsMap.set(key, {
                product_id: Math.max(0, toSafeNumber(row.product_id)),
                spot_id: Math.max(0, toSafeNumber(row.spot_id)),
                stock_now: Math.max(0, toSafeNumber(row.stock_now)),
                min_stock: Math.max(0, toSafeNumber(row.min_stock)),
                avg_sales_day: Math.max(0, toSafeNumber(row.avg_sales_day)),
                need_net: Math.max(0, toSafeNumber(row.need_net)),
            });
        }

        const uniqueProductIds = Array.from(new Set(Array.from(statsMap.values()).map((row) => row.product_id)))
            .filter((id) => Number.isFinite(id) && id > 0);
        const distributionProductNames = Array.from(
            new Set(
                ((distributionRes.data || []) as Array<Record<string, unknown>>)
                    .map((row) => String(row.product_name || '').trim())
                    .filter(Boolean)
            )
        );

        const unitByProductId = new Map<number, string>();
        const unitByProductName = new Map<string, string>();
        if (uniqueProductIds.length > 0) {
            const { data: unitRows, error: unitError } = await supabaseAdmin
                .schema('konditerka1')
                .from('production_180d_products')
                .select('product_id, product_name, unit')
                .in('product_id', uniqueProductIds);

            if (unitError) {
                console.error('Konditerka units read error:', unitError);
                return NextResponse.json({ error: unitError.message }, { status: 500 });
            }

            for (const unitRow of (unitRows || []) as Array<Record<string, unknown>>) {
                const productId = Math.max(0, toSafeNumber(unitRow.product_id));
                if (productId <= 0) continue;
                const unit = normalizeKonditerkaUnit(unitRow.unit, String(unitRow.product_name || ''));
                unitByProductId.set(productId, unit);
                const productNameKey = normalizeKey(unitRow.product_name);
                if (productNameKey) {
                    unitByProductName.set(productNameKey, unit);
                }
            }
        }

        const missingUnitNames = distributionProductNames.filter(
            (productName) => !unitByProductName.has(normalizeKey(productName))
        );

        if (missingUnitNames.length > 0) {
            const { data: unitRowsByName, error: unitByNameError } = await supabaseAdmin
                .schema('konditerka1')
                .from('production_180d_products')
                .select('product_name, unit')
                .in('product_name', missingUnitNames);

            if (unitByNameError) {
                console.error('Konditerka units-by-name read error:', unitByNameError);
                return NextResponse.json({ error: unitByNameError.message }, { status: 500 });
            }

            for (const unitRow of (unitRowsByName || []) as Array<Record<string, unknown>>) {
                const productNameKey = normalizeKey(unitRow.product_name);
                if (!productNameKey) continue;
                unitByProductName.set(
                    productNameKey,
                    normalizeKonditerkaUnit(unitRow.unit, String(unitRow.product_name || ''))
                );
            }
        }

        const rowsForPackaging = ((distributionRes.data || []) as Array<Record<string, unknown>>).map((row) => {
            const key = `${normalizeKey(row.product_name)}::${normalizeKey(row.spot_name)}`;
            const stats = statsMap.get(key);
            const productId = stats?.product_id ?? 0;
            const unit = normalizeKonditerkaUnit(
                unitByProductId.get(productId) || unitByProductName.get(normalizeKey(row.product_name)),
                String(row.product_name || '')
            );
            return {
                ...row,
                product_id: productId,
                spot_id: stats?.spot_id ?? 0,
                unit,
                stock_now: stats?.stock_now ?? 0,
                min_stock: stats?.min_stock ?? 0,
                avg_sales_day: stats?.avg_sales_day ?? 0,
                need_net: stats?.need_net ?? 0,
                quantity_to_ship: Math.max(0, toSafeNumber(row.quantity_to_ship)),
                calc_time: row.created_at ?? null,
            };
        });

        const packagingConfigMap = await fetchKonditerkaPackagingConfig(
            supabaseAdmin,
            rowsForPackaging.map((row) => Math.max(0, toSafeNumber(row.product_id)))
        ).catch(() => new Map());

        const enriched = applyKonditerkaPackagingConfigToRows(rowsForPackaging, packagingConfigMap);

        const responseRows = enriched.map((row) => ({
            ...row,
            current_stock: Math.max(0, toSafeNumber(row.stock_now)),
            min_stock: Math.max(0, toSafeNumber(row.min_stock)),
            avg_sales: Math.max(0, toSafeNumber(row.avg_sales_day)),
            need_net: Math.max(0, toSafeNumber(row.need_net)),
            packaging_enabled: Boolean(row.packaging_enabled),
            stock_now_packs_est: Math.max(0, toSafeNumber(row.stock_now_packs_est)),
            min_stock_packs_est: Math.max(0, toSafeNumber(row.min_stock_packs_est)),
            need_net_packs_est: Math.max(0, toSafeNumber(row.need_net_packs_est)),
            quantity_to_ship_packs_est: Math.max(0, toSafeNumber(row.quantity_to_ship_packs_est)),
        }));

        return NextResponse.json(responseRows);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
