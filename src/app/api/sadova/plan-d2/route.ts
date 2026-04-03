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
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
            }
        );

        const { data, error } = await supabaseAdmin
            .schema('sadova1')
            .rpc('f_calculate_evening_d2');

        if (error) {
            console.error('Error fetching data:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const plan = (data || []).reduce((acc: any[], item: any) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const existing = acc.find((x: any) => x.product_name === item.result_product_name);

            if (existing) {
                existing.allocated_d2 += item.result_allocated_qty;
            } else {
                acc.push({
                    product_name: item.result_product_name,
                    allocated_d2: item.result_allocated_qty
                });
            }

            return acc;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }, []).filter((x: any) => x.allocated_d2 > 0)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .sort((a: any, b: any) => b.allocated_d2 - a.allocated_d2)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((item: any, index: number) => ({ ...item, rank: index + 1 }));

        return NextResponse.json({
            success: true,
            data: plan,
            generated_at: new Date().toISOString()
        });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        console.error('Unhandled error in plan-d2 route:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
