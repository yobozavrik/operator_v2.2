import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { coercePositiveInt } from '@/lib/branch-api';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const startDateParam = searchParams.get('start_date');
        const endDateParam = searchParams.get('end_date');
        const days = coercePositiveInt(searchParams.get('days'), 14, 1, 365);

        if (startDateParam && !DATE_RE.test(startDateParam)) {
            return NextResponse.json({ error: 'Invalid start_date format, expected YYYY-MM-DD' }, { status: 400 });
        }
        if (endDateParam && !DATE_RE.test(endDateParam)) {
            return NextResponse.json({ error: 'Invalid end_date format, expected YYYY-MM-DD' }, { status: 400 });
        }

        let p_start_date: string;
        let p_end_date: string;

        if (startDateParam && endDateParam) {
            p_start_date = startDateParam;
            p_end_date = endDateParam;
        } else {
            const endDate = new Date();
            const startDate = new Date();
            // Берем период "вчера - (N-1) дней", чтобы не учитывать сегодняшний незавершенный день
            endDate.setDate(endDate.getDate() - 1);
            startDate.setDate(endDate.getDate() - (days - 1));

            p_start_date = startDate.toISOString().split('T')[0];
            p_end_date = endDate.toISOString().split('T')[0];
        }

        const p_date = p_end_date;

        const { createClient: createSupabaseJSClient } = await import('@supabase/supabase-js');
        const supabase = createSupabaseJSClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Run RPCs in parallel to reduce waterfall loading time
        const [
            { data: networkMetrics, error: networkErr },
            { data: rankings, error: rankingErr },
            { data: trends, error: trendErr }
        ] = await Promise.all([
            supabase.rpc('f_craft_get_network_metrics', { p_start_date, p_end_date }),
            supabase.rpc('f_craft_get_store_ranking', { p_start_date, p_end_date }),
            supabase.rpc('f_craft_get_sku_trend', { p_date })
        ]);

        if (networkErr) {
            Logger.error('RPC Error f_craft_get_network_metrics', { error: networkErr.message });
            throw new Error(`networkMetrics: ${networkErr.message}`);
        }

        if (rankingErr) {
            Logger.error('RPC Error f_craft_get_store_ranking', { error: rankingErr.message });
            throw new Error(`rankings: ${rankingErr.message}`);
        }

        if (trendErr) {
            Logger.error('RPC Error f_craft_get_sku_trend', { error: trendErr.message });
            throw new Error(`trends: ${trendErr.message}`);
        }

        // Учитывая, что "Здоровье дисконта" - это магазины с высоким каннибализмом,
        // скорее всего эти данные возвращаются в rankings.top_stores или rankings.bottom_stores,
        // либо в новом ключе внутри rankings_data. Мы отдаем всё как есть на фронтенд.

        return NextResponse.json({
            network: networkMetrics || {},
            ranking: rankings || {},
            trends: trends || [],
            params: { p_start_date, p_end_date }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        Logger.error('Critical Bakery API Error', { error: err.message || String(err) });
        return NextResponse.json({
            error: 'Internal Server Error',
            message: err.message
        }, { status: 500 });
    }
}
