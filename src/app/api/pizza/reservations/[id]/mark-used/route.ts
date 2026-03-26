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
        .select('id, reservation_date, customer_name, status')
        .eq('id', id)
        .single();

    if (reservationError) {
        return NextResponse.json({ error: reservationError.message }, { status: 500 });
    }

    if (!reservation) {
        return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    if (reservation.status !== 'confirmed') {
        return NextResponse.json({ error: 'Only confirmed reservation can be marked as used' }, { status: 409 });
    }

    const { error: supersedeError } = await supabase
        .schema('pizza1')
        .from('customer_reservations')
        .update({ status: 'superseded' })
        .eq('reservation_date', reservation.reservation_date)
        .eq('customer_name', reservation.customer_name)
        .in('status', ['confirmed', 'used_in_distribution'])
        .neq('id', reservation.id);

    if (supersedeError) {
        return NextResponse.json({ error: supersedeError.message }, { status: 500 });
    }

    const { error: updateError } = await supabase
        .schema('pizza1')
        .from('customer_reservations')
        .update({
            status: 'used_in_distribution',
            confirmed_by: auth.user.id,
        })
        .eq('id', reservation.id);

    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: reservation.id });
}
