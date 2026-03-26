import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';

export const dynamic = 'force-dynamic';

type ReservationItemInput = {
    sku: string;
    qty: number;
};

type ReservationPayload = {
    id?: string;
    reservationDate: string;
    customerName: string;
    items: ReservationItemInput[];
};

function normalizeItems(items: ReservationItemInput[]) {
    const bySku = new Map<string, number>();

    for (const item of items) {
        const sku = String(item.sku || '').trim();
        const qty = Number(item.qty);
        if (!sku || !Number.isFinite(qty) || qty <= 0) continue;
        bySku.set(sku, Math.trunc(qty));
    }

    return Array.from(bySku.entries()).map(([sku, qty]) => ({ sku, qty }));
}

export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const date = request.nextUrl.searchParams.get('date');
    const supabase = createServiceRoleClient();

    let query = supabase
        .schema('pizza1')
        .from('customer_reservations')
        .select(
            `
            id,
            reservation_date,
            customer_name,
            status,
            previous_reservation_id,
            version_no,
            created_by,
            created_at,
            updated_at,
            confirmed_by,
            confirmed_at,
            customer_reservation_items (
                id,
                sku,
                qty,
                created_at,
                updated_at
            )
        `
        )
        .order('reservation_date', { ascending: false })
        .order('version_no', { ascending: false })
        .order('created_at', { ascending: false });

    if (date) {
        query = query.eq('reservation_date', date);
    }

    const { data, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = (await request.json()) as ReservationPayload;
    const reservationDate = String(body.reservationDate || '').trim();
    const customerName = String(body.customerName || '').trim();
    const normalizedItems = normalizeItems(Array.isArray(body.items) ? body.items : []);

    if (!reservationDate) {
        return NextResponse.json({ error: 'reservationDate is required' }, { status: 400 });
    }

    if (!customerName) {
        return NextResponse.json({ error: 'customerName is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const reservationId = body.id ? String(body.id) : null;

    if (reservationId) {
        const { data: existing, error: existingError } = await supabase
            .schema('pizza1')
            .from('customer_reservations')
            .select('id, status')
            .eq('id', reservationId)
            .single();

        if (existingError) {
            return NextResponse.json({ error: existingError.message }, { status: 500 });
        }

        if (!existing) {
            return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
        }

        if (existing.status !== 'draft') {
            return NextResponse.json({ error: 'Only draft reservations can be edited' }, { status: 409 });
        }

        const { error: updateError } = await supabase
            .schema('pizza1')
            .from('customer_reservations')
            .update({
                reservation_date: reservationDate,
                customer_name: customerName,
            })
            .eq('id', reservationId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        const { error: deleteError } = await supabase
            .schema('pizza1')
            .from('customer_reservation_items')
            .delete()
            .eq('reservation_id', reservationId);

        if (deleteError) {
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        if (normalizedItems.length > 0) {
            const { error: insertItemsError } = await supabase
                .schema('pizza1')
                .from('customer_reservation_items')
                .insert(
                    normalizedItems.map((item) => ({
                        reservation_id: reservationId,
                        sku: item.sku,
                        qty: item.qty,
                    }))
                );

            if (insertItemsError) {
                return NextResponse.json({ error: insertItemsError.message }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true, id: reservationId });
    }

    const { data: created, error: createError } = await supabase
        .schema('pizza1')
        .from('customer_reservations')
        .insert({
            reservation_date: reservationDate,
            customer_name: customerName,
            created_by: auth.user.id,
            status: 'draft',
            version_no: 1,
        })
        .select('id')
        .single();

    if (createError || !created) {
        return NextResponse.json({ error: createError?.message || 'Failed to create reservation' }, { status: 500 });
    }

    if (normalizedItems.length > 0) {
        const { error: insertItemsError } = await supabase
            .schema('pizza1')
            .from('customer_reservation_items')
            .insert(
                normalizedItems.map((item) => ({
                    reservation_id: created.id,
                    sku: item.sku,
                    qty: item.qty,
                }))
            );

        if (insertItemsError) {
            return NextResponse.json({ error: insertItemsError.message }, { status: 500 });
        }
    }

    return NextResponse.json({ success: true, id: created.id });
}
