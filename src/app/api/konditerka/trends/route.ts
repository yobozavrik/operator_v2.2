import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await createClient();

    const query = `
        SELECT
            p.name as product_name,
            p.unit as unit,
            SUM(CASE WHEN t.date_close >= CURRENT_DATE - INTERVAL '7 days' AND t.date_close < CURRENT_DATE THEN COALESCE(ti.num, 0) ELSE 0 END) as qty_last_7,
            SUM(CASE WHEN t.date_close >= CURRENT_DATE - INTERVAL '14 days' AND t.date_close < CURRENT_DATE - INTERVAL '7 days' THEN COALESCE(ti.num, 0) ELSE 0 END) as qty_prev_7
        FROM categories.transactions t
        JOIN categories.transaction_items ti ON t.transaction_id = ti.transaction_id
        JOIN categories.products p ON ti.product_id = p.id
        JOIN categories.categories c ON p.category_id = c.category_id
        WHERE t.date_close >= CURRENT_DATE - INTERVAL '14 days' AND t.date_close < CURRENT_DATE
        AND (c.category_name ILIKE '%кондите%' OR c.category_name ILIKE '%десерт%' OR c.category_name ILIKE '%солодк%' OR c.category_name ILIKE '%морозив%')
        GROUP BY p.name, p.unit
        ORDER BY qty_last_7 DESC
    `.trim();

    try {
        const { data, error } = await supabase.rpc('exec_sql', { query });

        if (error) {
            console.error('Error fetching konditerka trends:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('Exception fetching konditerka trends:', e);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
