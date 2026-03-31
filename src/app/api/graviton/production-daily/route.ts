import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const auth = await requireAuth();
        if (auth.error) return auth.error;

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Missing Supabase service credentials');
        }

        const { searchParams } = new URL(request.url);
        const kyivDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
        const date = searchParams.get('date') ?? kyivDate;
        const storageId = parseInt(searchParams.get('storage_id') ?? '2');

        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const gravitonDb = supabase.schema('graviton');

        const { data, error } = await gravitonDb
            .from('production_daily')
            .select('storage_id, product_name, product_name_normalized, quantity_kg, synced_at')
            .eq('business_date', date)
            .eq('storage_id', storageId)
            .order('quantity_kg', { ascending: false });

        if (error) throw new Error(error.message);

        return NextResponse.json({
            success: true,
            data: data ?? [],
            synced_at: (data ?? [])[0]?.synced_at ?? null,
        });
    } catch (err: any) {
        console.error('production-daily GET error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
