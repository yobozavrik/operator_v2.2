import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role key since this is a heavy calculation function that might be called by n8n or the dashboard
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(request: NextRequest) {
    try {
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data, error } = await supabaseAdmin
            .from('v_graviton_plan_d1')
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
