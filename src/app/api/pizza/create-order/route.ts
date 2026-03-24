import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const body = await request.json();

        // Log the order for now (or insert into a 'production_orders' table if it existed)
        console.log('[Create Order] Received Production Order:', JSON.stringify(body, null, 2));

        // TODO: Insert into Supabase 'baking_orders' table
        // const { data, error } = await supabase.from('baking_orders').insert(body.orders);

        return NextResponse.json({ success: true, message: 'Order created locally (logged)' });
    } catch (error) {
        console.error('[Create Order] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
