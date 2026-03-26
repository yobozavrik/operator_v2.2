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

    const { data: source, error: sourceError } = await supabase
        .schema('pizza1')
        .from('customer_reservations')
        .select(
            `
            id,
            reservation_date,
            customer_name,
            status,
            version_no,
            customer_reservation_items (
                sku,
                qty
            )
        `
        )
        .eq('id', id)
        .single();

    if (sourceError) {
        return NextResponse.json({ error: sourceError.message }, { status: 500 });
    }

    if (!source) {
        return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    if (source.status === 'draft') {
        return NextResponse.json({ error: 'Draft does not require versioning' }, { status: 409 });
    }

    const { data: existingDraft } = await supabase
        .schema('pizza1')
        .from('customer_reservations')
        .select('id')
        .eq('reservation_date', source.reservation_date)
        .eq('customer_name', source.customer_name)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existingDraft) {
        return NextResponse.json({ success: true, id: existingDraft.id, reused: true });
    }

    const nextVersion = Math.max(1, Number(source.version_no || 1) + 1);

    const { data: created, error: createError } = await supabase
        .schema('pizza1')
        .from('customer_reservations')
        .insert({
            reservation_date: source.reservation_date,
            customer_name: source.customer_name,
            status: 'draft',
            created_by: auth.user.id,
            previous_reservation_id: source.id,
            version_no: nextVersion,
        })
        .select('id')
        .single();

    if (createError || !created) {
        return NextResponse.json({ error: createError?.message || 'Failed to create version' }, { status: 500 });
    }

    const items = Array.isArray(source.customer_reservation_items)
        ? source.customer_reservation_items
        : [];

    if (items.length > 0) {
        const { error: insertItemsError } = await supabase
            .schema('pizza1')
            .from('customer_reservation_items')
            .insert(
                items.map((item) => ({
                    reservation_id: created.id,
                    sku: item.sku,
                    qty: item.qty,
                }))
            );

        if (insertItemsError) {
            return NextResponse.json({ error: insertItemsError.message }, { status: 500 });
        }
    }

    return NextResponse.json({ success: true, id: created.id, reused: false });
}
