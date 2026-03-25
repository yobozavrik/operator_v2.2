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
            .schema('graviton')
            .rpc('f_calculate_evening_d2');

        if (error) {
            console.error('Error fetching data:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const critical = (data || []).reduce((acc: any[], item: any) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const existing = acc.find((x: any) => x.product_name === item.result_product_name);

            if (existing) {
                if (item.result_stock_d2_evening <= 0) existing.zeros_d2++;
                if (item.result_deficit_d2 > 0) existing.deficit_d2 += item.result_deficit_d2;
                existing.total_stock_d2 += item.result_stock_d2_evening;
            } else {
                acc.push({
                    product_name: item.result_product_name,
                    zeros_d2: item.result_stock_d2_evening <= 0 ? 1 : 0,
                    deficit_d2: item.result_deficit_d2 > 0 ? item.result_deficit_d2 : 0,
                    total_stock_d2: item.result_stock_d2_evening
                });
            }

            return acc;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }, []).filter((x: any) => x.zeros_d2 > 0 || x.deficit_d2 > 0)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .sort((a: any, b: any) => {
                if (b.zeros_d2 !== a.zeros_d2) return b.zeros_d2 - a.zeros_d2;
                return b.deficit_d2 - a.deficit_d2;
            })
            .slice(0, 20);

        return NextResponse.json({
            success: true,
            data: critical,
            generated_at: new Date().toISOString()
        });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        console.error('Unhandled error in critical-d2 route:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
