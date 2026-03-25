import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

function hasInternalApiAccess(request: Request): boolean {
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) return false;

    const authHeader = request.headers.get('authorization');
    const headerSecret = request.headers.get('x-internal-api-secret');

    return authHeader === `Bearer ${secret}` || headerSecret === secret;
}

function kyivBusinessDate(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Kyiv',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const month = parts.find((p) => p.type === 'month')?.value ?? '01';
    const day = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${year}-${month}-${day}`;
}

function getServiceClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase service credentials');
    }
    return createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
    });
}

export async function GET(request: Request) {
    if (!hasInternalApiAccess(request)) {
        const auth = await requireAuth();
        if (auth.error) return auth.error;
    }

    try {
        const supabase = getServiceClient();
        const todayKyiv = kyivBusinessDate();

        const { data: results, error } = await supabase
            .schema('sadova1')
            .from('distribution_results')
            .select('product_id, quantity_to_ship')
            .eq('business_date', todayKyiv)
            .limit(1000);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        type ResultRow = { product_id: number | null; quantity_to_ship: number | null };
        const rows = (results || []) as ResultRow[];

        const totalKg = rows.reduce((sum, r) => sum + (Number(r.quantity_to_ship) || 0), 0);
        const skuCount = new Set(rows.map((r) => r.product_id).filter((id) => id !== null)).size;

        return NextResponse.json(
            { shopLoad: totalKg, criticalSKU: 0, totalSKU: skuCount, lastUpdate: new Date().toISOString() },
            { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } }
        );
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
