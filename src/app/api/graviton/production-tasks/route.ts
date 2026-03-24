import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('v_graviton_production_tasks_test')
            .select('*')
            .order('product_name', { ascending: true });

        if (error) {
            console.error('Supabase error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        console.error('API Error:', err);
        return NextResponse.json({
            error: 'Internal Server Error',
            message: err.message
        }, { status: 500 });
    }
}
