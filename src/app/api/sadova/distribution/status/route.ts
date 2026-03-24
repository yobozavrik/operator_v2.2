import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

function hasInternalApiAccess(request: Request): boolean {
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) return false;

    const authHeader = request.headers.get('authorization');
    const headerSecret = request.headers.get('x-internal-api-secret');

    return authHeader === `Bearer ${secret}` || headerSecret === secret;
}

export async function GET(request: Request) {
    if (!hasInternalApiAccess(request)) {
        const auth = await requireAuth();
        if (auth.error) return auth.error;
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !supabaseUrl) {
        return NextResponse.json({ error: 'Server Config Error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false },
    });

    try {
        const { searchParams } = new URL(request.url);
        const batchId = String(searchParams.get('batch_id') || '').trim();

        const query = supabase
            .schema('sadova1')
            .from('distribution_logs')
            .select('*')
            .order('started_at', { ascending: false })
            .limit(1);

        const { data, error } = batchId
            ? await query.eq('batch_id', batchId)
            : await query;

        if (error) {
            console.error('Sadova distribution status read error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const row = Array.isArray(data) ? data[0] : null;
        return NextResponse.json({ success: true, status: row || null });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
