import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// Мы используем anon/service key в зависимости от настройки в проекте
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action') || 'network';
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const targetDate = searchParams.get('date');

        if (action === 'network') {
            if (!startDate || !endDate) return NextResponse.json({ error: 'startDate and endDate required' }, { status: 400 });

            const { data, error } = await supabase.rpc('f_craft_get_network_metrics', {
                p_start_date: startDate,
                p_end_date: endDate
            }, { count: 'exact' });

            if (error) throw error;
            return NextResponse.json(data);
        }

        if (action === 'ranking') {
            if (!startDate || !endDate) return NextResponse.json({ error: 'startDate and endDate required' }, { status: 400 });

            const { data, error } = await supabase.rpc('f_craft_get_store_ranking', {
                p_start_date: startDate,
                p_end_date: endDate
            });

            if (error) throw error;
            return NextResponse.json(data);
        }

        if (action === 'trend') {
            if (!targetDate) return NextResponse.json({ error: 'date required' }, { status: 400 });

            const { data, error } = await supabase.rpc('f_craft_get_sku_trend', {
                p_date: targetDate
            });

            if (error) throw error;
            return NextResponse.json(data);
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Analytics Fetch Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
