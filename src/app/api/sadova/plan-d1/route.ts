import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data, error } = await (supabaseAdmin as any)
            .schema('sadova1')
            .from('v_plan_d1')
            .select('*');

        if (error) {
            console.error('Error fetching D1 plan:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        const orderData = data || [];

        return NextResponse.json({
            success: true,
            data: orderData,
            generated_at: new Date().toISOString()
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        console.error('Unhandled error in plan-d1 route:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
