import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';
import { fetchFloridaProduction180dProductIds } from '@/lib/florida-production-180d';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

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

    const workshopProductIds = await fetchFloridaProduction180dProductIds(supabase);
    if (workshopProductIds.length === 0) {
        return NextResponse.json([]);
    }

    const idList = workshopProductIds
        .map((id) => Math.trunc(Number(id)))
        .filter((id) => Number.isFinite(id) && id > 0)
        .join(',');

    if (!idList) {
        return NextResponse.json([]);
    }

    const query = `
        SELECT
            p.name as product_name,
            SUM(CASE WHEN t.date_close >= CURRENT_DATE - INTERVAL '7 days' AND t.date_close < CURRENT_DATE THEN COALESCE(ti.num, 0) ELSE 0 END) as qty_last_7,
            SUM(CASE WHEN t.date_close >= CURRENT_DATE - INTERVAL '14 days' AND t.date_close < CURRENT_DATE - INTERVAL '7 days' THEN COALESCE(ti.num, 0) ELSE 0 END) as qty_prev_7
        FROM categories.transactions t
        JOIN categories.transaction_items ti ON t.transaction_id = ti.transaction_id
        JOIN categories.products p ON ti.product_id = p.id
        WHERE t.date_close >= CURRENT_DATE - INTERVAL '14 days' AND t.date_close < CURRENT_DATE
        AND ti.product_id IN (${idList})
        GROUP BY p.name
        ORDER BY qty_last_7 DESC
    `.trim();

    try {
        const { data, error } = await supabase.rpc('exec_sql', { query });

        if (error) {
            console.error('Error fetching florida trends:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (e: any) {
        console.error('Exception fetching florida trends:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
