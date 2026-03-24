import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { normalizeKonditerkaUnit } from '@/lib/konditerka-dictionary';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const productName = searchParams.get('konditerka') || searchParams.get('pizza');

    if (!productName) {
        return NextResponse.json({ error: 'Konditerka name is required' }, { status: 400 });
    }

    try {
        const { data, error } = await supabase
            .schema('konditerka1').from('v_konditerka_distribution_stats')
            .select('product_id, spot_name, stock_now, min_stock, avg_sales_day')
            .eq('product_name', productName);

        if (error) {
            console.error('Database Error:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const rows = data || [];
        const productId = Number(rows[0]?.product_id);
        let unit = normalizeKonditerkaUnit(undefined, productName);

        if (Number.isFinite(productId) && productId > 0) {
            const { data: productRow } = await supabase
                .schema('konditerka1')
                .from('production_180d_products')
                .select('unit')
                .eq('product_id', productId)
                .maybeSingle();

            unit = normalizeKonditerkaUnit(productRow?.unit, productName);
        }

        return NextResponse.json(rows.map((row) => ({ ...row, unit })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
