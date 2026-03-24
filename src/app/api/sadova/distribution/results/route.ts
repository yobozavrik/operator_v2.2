import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function hasInternalApiAccess(request: Request): boolean {
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) return false;

    const authHeader = request.headers.get('authorization');
    const headerSecret = request.headers.get('x-internal-api-secret');

    return authHeader === `Bearer ${secret}` || headerSecret === secret;
}

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

export async function GET(request: Request) {
    if (!hasInternalApiAccess(request)) {
        const auth = await requireAuth();
        if (auth.error) return auth.error;
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !supabaseUrl) {
        return NextResponse.json({ error: 'Server Config Error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false },
    });

    try {
        const targetDate = resolveTargetDate(request);
        const { data, error } = await supabase
            .schema('sadova1')
            .rpc('fn_get_distribution_results', { p_business_date: targetDate });

        if (error) {
            console.error('Sadova distribution results read error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const normalize = (value: string) =>
            String(value || '')
                .toLowerCase()
                .replace(/магазин\s*/g, '')
                .replace(/["'«»]/g, '')
                .trim();

        const attachStats = async (rows: Record<string, unknown>[]) => {
            const productIds = Array.from(
                new Set(rows.map((row) => Number(row.product_id)).filter((id) => Number.isFinite(id) && id > 0))
            );

            if (productIds.length === 0) return rows;

            const { data: statsRows, error: statsError } = await supabase
                .schema('sadova1')
                .from('v_sadova_distribution_stats')
                .select('product_id, spot_name, stock_now, min_stock, avg_sales_day')
                .in('product_id', productIds);

            if (statsError) {
                console.error('Sadova distribution stats read error:', statsError);
                return rows;
            }

            type StatRow = {
                product_id: number | null;
                spot_name: string | null;
                stock_now: number | null;
                min_stock: number | null;
                avg_sales_day: number | null;
            };
            const byKey = new Map<string, { stock_now: number; min_stock: number; avg_sales_day: number }>();
            ((statsRows || []) as StatRow[]).forEach((row) => {
                const key = `${Number(row.product_id)}|${normalize(String(row.spot_name || ''))}`;
                byKey.set(key, {
                    stock_now: Number(row.stock_now || 0),
                    min_stock: Number(row.min_stock || 0),
                    avg_sales_day: Number(row.avg_sales_day || 0),
                });
            });

            return rows.map((row) => {
                const key = `${Number(row.product_id)}|${normalize(String(row.spot_name || ''))}`;
                const stat = byKey.get(key);
                return {
                    ...row,
                    stock_now: stat?.stock_now ?? null,
                    min_stock: stat?.min_stock ?? null,
                    avg_sales_day: stat?.avg_sales_day ?? null,
                };
            });
        };

        if (Array.isArray(data)) {
            const enriched = await attachStats(data as Record<string, unknown>[]);
            return NextResponse.json(enriched);
        }

        if (data && typeof data === 'object') {
            const maybeOneRow = data as Record<string, unknown>;
            if ('id' in maybeOneRow && 'product_id' in maybeOneRow) {
                return NextResponse.json([maybeOneRow]);
            }

            const nestedData = maybeOneRow.data;
            if (Array.isArray(nestedData)) {
                const enriched = await attachStats(nestedData as Record<string, unknown>[]);
                return NextResponse.json(enriched);
            }
        }

        // Fallback: direct select from table if RPC returned unexpected payload
        const { data: fallbackRows, error: fallbackError } = await supabase
            .schema('sadova1')
            .from('distribution_results')
            .select(
                'id, product_id, product_name, spot_id, spot_name, quantity_to_ship, calculation_batch_id, business_date, delivery_status, created_at'
            )
            .eq('business_date', targetDate)
            .order('product_name', { ascending: true })
            .order('spot_name', { ascending: true });

        if (fallbackError) {
            return NextResponse.json({ error: fallbackError.message }, { status: 500 });
        }

        const enrichedFallback = await attachStats((fallbackRows || []) as Record<string, unknown>[]);
        return NextResponse.json(enrichedFallback);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
