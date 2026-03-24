import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    // 1. Service Role (теперь без пробелов!)
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return NextResponse.json({ error: 'Server Config Error' }, { status: 500 });
    }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );

    try {
        // 2. Читаем из вьюхи
        const { data, error } = await supabaseAdmin
            .from('v_today_distribution')
            .select('*')
            .order('product_name', { ascending: true });

        if (error) {
            console.error('❌ Reading Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data || []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
