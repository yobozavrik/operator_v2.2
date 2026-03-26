import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';

export const dynamic = 'force-dynamic';

type Params = {
    params: Promise<{
        id: string;
    }>;
};

export async function POST(_request: NextRequest, context: Params) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: reservation, error: reservationError } = await supabase
        .schema('pizza1')
        .from('customer_reservations')
        .select('id, status')
        .eq('id', id)
        .single();

    if (reservationError) {
        return NextResponse.json({ error: reservationError.message }, { status: 500 });
    }

    if (!reservation) {
        return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    if (reservation.status !== 'draft') {
        return NextResponse.json({ error: 'Only draft reservations can be confirmed' }, { status: 409 });
    }

    const { count, error: countError } = await supabase
        .schema('pizza1')
        .from('customer_reservation_items')
        .select('*', { count: 'exact', head: true })
        .eq('reservation_id', id);

    if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    if (!count || count <= 0) {
        return NextResponse.json({ error: 'Reservation must contain at least one item' }, { status: 400 });
    }

    const { error: updateError } = await supabase
        .schema('pizza1')
        .from('customer_reservations')
        .update({
            status: 'confirmed',
            confirmed_by: auth.user.id,
            confirmed_at: new Date().toISOString(),
        })
        .eq('id', id);

    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id });
}
