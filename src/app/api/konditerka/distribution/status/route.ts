
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data, error } = await supabase
            .from('v_production_ready_status')
            .select('prod_count')
            .single();

        if (error) {
            if (error.message.includes('does not exist')) {
                return NextResponse.json({ prod_count: 0, warning: error.message });
            }
            console.error('Status Fetch Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
