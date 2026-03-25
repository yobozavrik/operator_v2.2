import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyFloridaPackagingConfigToRows, fetchFloridaPackagingConfig } from '@/lib/florida-packaging';

export const dynamic = 'force-dynamic';

function parseRequestedDate(request: NextRequest): string | null {
    const date = request.nextUrl.searchParams.get('date');
    if (!date) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export async function GET(request: NextRequest) {
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
    const requestedDate = parseRequestedDate(request);

    if (request.nextUrl.searchParams.has('date') && !requestedDate) {
        return NextResponse.json({ error: 'Invalid date format. Expected YYYY-MM-DD' }, { status: 400 });
    }

    try {
        const toSafeNumber = (value: unknown): number => {
            if (typeof value === 'number' && Number.isFinite(value)) return value;
            if (typeof value === 'string') {
                const parsed = Number(value.replace(',', '.').trim());
                return Number.isFinite(parsed) ? parsed : 0;
            }
            return 0;
        };

        const normalizeKey = (value: unknown): string =>
            String(value || '')
                .toLowerCase()
                .replace(/["'«»]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

        if (requestedDate) {
            const [distributionRes, statsRes] = await Promise.all([
                supabaseAdmin
                    .schema('florida1')
                    .rpc('fn_get_distribution_results', { p_business_date: requestedDate }),
                supabaseAdmin
                    .schema('florida1')
                    .from('v_florida_distribution_stats')
                    .select('product_id, product_name, spot_id, spot_name, unit, stock_now, min_stock, avg_sales_day, need_net'),
            ]);

            if (distributionRes.error) {
                console.error('Florida distribution history read error:', distributionRes.error);
                return NextResponse.json({ error: distributionRes.error.message }, { status: 500 });
            }
            if (statsRes.error) {
                console.error('Florida distribution history stats read error:', statsRes.error);
                return NextResponse.json({ error: statsRes.error.message }, { status: 500 });
            }

            const statsMap = new Map<string, Record<string, unknown>>();
            for (const row of (statsRes.data || []) as Array<Record<string, unknown>>) {
                const key = `${normalizeKey(row.product_name)}::${normalizeKey(row.spot_name)}`;
                if (key === '::' || statsMap.has(key)) continue;
                statsMap.set(key, row);
            }

            const rowsForPackaging = ((distributionRes.data || []) as Array<Record<string, unknown>>).map((row) => {
                const key = `${normalizeKey(row.product_name)}::${normalizeKey(row.spot_name)}`;
                const stats = statsMap.get(key);
                return {
                    ...row,
                    product_id: Number(stats?.product_id ?? row.product_id ?? 0),
                    spot_id: Number(stats?.spot_id ?? row.spot_id ?? 0),
                    unit: String(stats?.unit || 'шт'),
                    stock_now: toSafeNumber(stats?.stock_now ?? row.current_stock),
                    min_stock: toSafeNumber(stats?.min_stock ?? row.min_stock),
                    avg_sales_day: toSafeNumber(stats?.avg_sales_day ?? row.avg_sales),
                    need_net: toSafeNumber(stats?.need_net ?? row.need_net),
                    quantity_to_ship: Math.max(0, toSafeNumber(row.quantity_to_ship)),
                    calc_time: row.created_at ?? null,
                };
            });

            const configMap = await fetchFloridaPackagingConfig(
                supabaseAdmin,
                rowsForPackaging.map((row) => Number(row.product_id))
            ).catch(() => new Map());

            const enrichedRows = applyFloridaPackagingConfigToRows(rowsForPackaging, configMap);

            return NextResponse.json(enrichedRows);
        }

        const [distributionRes, statsRes] = await Promise.all([
            supabaseAdmin
                .schema('florida1')
                .from('v_florida_today_distribution')
                .select('*')
                .order('product_name', { ascending: true }),
            supabaseAdmin
                .schema('florida1')
                .from('v_florida_distribution_stats')
                .select('product_id, product_name, spot_id, spot_name, unit, stock_now, min_stock, avg_sales_day, need_net'),
        ]);

        if (distributionRes.error) {
            console.error('Florida distribution read error:', distributionRes.error);
            return NextResponse.json({ error: distributionRes.error.message }, { status: 500 });
        }
        if (statsRes.error) {
            console.error('Florida distribution stats read error:', statsRes.error);
            return NextResponse.json({ error: statsRes.error.message }, { status: 500 });
        }

        const statsMap = new Map<string, Record<string, unknown>>();
        for (const row of (statsRes.data || []) as Array<Record<string, unknown>>) {
            const key = `${normalizeKey(row.product_name)}::${normalizeKey(row.spot_name)}`;
            if (key === '::' || statsMap.has(key)) continue;
            statsMap.set(key, row);
        }

        const rowsForPackaging = ((distributionRes.data || []) as Array<Record<string, unknown>>).map((row) => {
            const key = `${normalizeKey(row.product_name)}::${normalizeKey(row.spot_name)}`;
            const stats = statsMap.get(key);
            return {
                ...row,
                product_id: Number(stats?.product_id ?? row.product_id ?? 0),
                spot_id: Number(stats?.spot_id ?? row.spot_id ?? 0),
                unit: String(stats?.unit || 'шт'),
                stock_now: toSafeNumber(stats?.stock_now ?? row.current_stock),
                min_stock: toSafeNumber(stats?.min_stock ?? row.min_stock),
                avg_sales_day: toSafeNumber(stats?.avg_sales_day ?? row.avg_sales),
                need_net: toSafeNumber(stats?.need_net ?? row.need_net),
                quantity_to_ship: Math.max(0, toSafeNumber(row.quantity_to_ship)),
                calc_time: row.created_at ?? null,
            };
        });

        const configMap = await fetchFloridaPackagingConfig(
            supabaseAdmin,
            rowsForPackaging.map((row) => Number(row.product_id))
        ).catch(() => new Map());

        const enrichedRows = applyFloridaPackagingConfigToRows(rowsForPackaging, configMap);

        return NextResponse.json(enrichedRows);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
