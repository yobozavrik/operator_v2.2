import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

type TodayDistributionRow = {
    product_name?: string | null;
    spot_name?: string | null;
    quantity_to_ship?: number | string | null;
    calc_time?: string | null;
};

type ReservationItemRow = {
    sku?: string | null;
    qty?: number | string | null;
};

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
        const kyivDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });

        const { data: distributionRows, error: distributionError } = await supabaseAdmin
            .from('v_today_distribution')
            .select('*')
            .order('product_name', { ascending: true });

        if (distributionError) {
            return NextResponse.json({ error: distributionError.message }, { status: 500 });
        }

        const { data: usedReservation, error: reservationError } = await supabaseAdmin
            .schema('pizza1')
            .from('customer_reservations')
            .select(`
                customer_name,
                confirmed_at,
                customer_reservation_items (
                    sku,
                    qty
                )
            `)
            .eq('reservation_date', kyivDate)
            .eq('status', 'used_in_distribution')
            .order('version_no', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (reservationError) {
            return NextResponse.json({ error: reservationError.message }, { status: 500 });
        }

        const baseRows = ((distributionRows || []) as TodayDistributionRow[]).map((row) => ({
            product_name: String(row.product_name || ''),
            spot_name: String(row.spot_name || ''),
            quantity_to_ship: Math.max(0, Number(row.quantity_to_ship || 0)),
            calc_time: row.calc_time || null,
        }));

        const reservationRows = usedReservation
            ? (((usedReservation.customer_reservation_items || []) as ReservationItemRow[])
                .filter((item) => Number(item.qty || 0) > 0)
                .map((item) => ({
                    product_name: String(item.sku || ''),
                    spot_name: String(usedReservation.customer_name || 'Замовник'),
                    quantity_to_ship: Math.max(0, Number(item.qty || 0)),
                    calc_time: usedReservation.confirmed_at || null,
                })))
            : [];

        return NextResponse.json([...baseRows, ...reservationRows]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
