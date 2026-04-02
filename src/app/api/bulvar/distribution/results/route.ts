import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

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
        const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
        const { data, error } = await supabaseAdmin
            .schema('bulvar1')
            .from('distribution_results')
            .select('product_name, spot_name, quantity_to_ship, calculation_batch_id, business_date, delivery_status, created_at')
            .eq('business_date', businessDate)
            .order('product_name', { ascending: true });

        if (error) {
            console.error('❌ Reading Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(
            (data || []).map((row: Record<string, unknown>) => ({
                product_name: row.product_name,
                spot_name: row.spot_name,
                quantity_to_ship: row.quantity_to_ship,
                calculation_batch_id: row.calculation_batch_id,
                business_date: row.business_date,
                delivery_status: row.delivery_status,
                calc_time: row.created_at,
            }))
        );
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
