import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

function parseRequestedDate(request: NextRequest): string | null {
    const date = request.nextUrl.searchParams.get('date');
    if (!date) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return NextResponse.json({ error: 'Server Config Error' }, { status: 500 });
    }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );
    const requestedDate = parseRequestedDate(request);

    if (request.nextUrl.searchParams.has('date') && !requestedDate) {
        return NextResponse.json({ error: 'Invalid date format. Expected YYYY-MM-DD' }, { status: 400 });
    }

    try {
        if (requestedDate) {
            const { data, error } = await supabaseAdmin
                .schema('florida1')
                .rpc('fn_get_distribution_results', { p_business_date: requestedDate });

            if (error) {
                console.error('Florida distribution history read error:', error);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json(data || []);
        }

        const { data, error } = await supabaseAdmin
            .schema('florida1')
            .from('v_florida_today_distribution')
            .select('*')
            .order('product_name', { ascending: true });

        if (error) {
            console.error('Florida distribution read error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data || []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
