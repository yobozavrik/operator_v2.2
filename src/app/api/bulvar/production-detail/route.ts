import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface ProductionOnlyRow {
    product_name: string;
    baked_at_factory: number;
}

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json(
                { error: 'Server Config Error', code: 'MISSING_SUPABASE_CONFIG' },
                { status: 500 }
            );
        }

        const supabase = createSupabaseClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false },
        });

        const { data, error } = await supabase
            .schema('bulvar1')
            .from('v_bulvar_production_only')
            .select('product_name, baked_at_factory')
            .order('baked_at_factory', { ascending: false });

        if (error) {
            Logger.error('[bulvar Production Detail] production query error', { error: error.message });
            return NextResponse.json({
                error: 'Query failed',
                message: error.message,
                code: 'DB_ERROR',
            }, { status: 500 });
        }

        return NextResponse.json((data || []) as ProductionOnlyRow[]);
    } catch (err: any) {
        Logger.error('[bulvar Production Detail] Critical Error', { error: err.message });
        return NextResponse.json({
            error: 'Internal Server Error',
            message: err.message,
            code: 'INTERNAL_ERROR',
        }, { status: 500 });
    }
}
