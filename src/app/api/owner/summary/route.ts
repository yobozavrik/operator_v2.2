import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireRole(['owner']);
    if (auth.error) return auth.error;

    try {
        const supabase = createServiceRoleClient();
        const { data, error } = await supabase
            .schema('executive')
            .from('owner_dashboard')
            .select('payload')
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data?.payload || {});
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}