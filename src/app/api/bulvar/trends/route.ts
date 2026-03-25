import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await createClient();

    try {
        const { data, error } = await supabase
            .schema('bulvar1')
            .from('v_bulvar_trends_14d')
            .select('product_id, product_name, unit, qty_last_7, qty_prev_7')
            .order('qty_last_7', { ascending: false })
            .limit(500);

        if (error) {
            console.error('Error fetching bulvar trends:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (e: any) {
        console.error('Exception fetching bulvar trends:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
