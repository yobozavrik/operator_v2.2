import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { readBulvarDistributionRows, toBulvarOrderRows } from '@/lib/bulvar-distribution-stats';

export const dynamic = 'force-dynamic';

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

        const { data: workshopProducts, error: workshopError } = await supabase
            .schema('bulvar1')
            .from('production_180d_products')
            .select('product_id');

        if (workshopError) {
            Logger.error('[bulvar Orders API] Workshop products query failed', { error: workshopError.message });
            return NextResponse.json(
                {
                    error: 'Database query failed',
                    message: workshopError.message,
                    code: 'DB_ERROR',
                },
                { status: 500 }
            );
        }

        const workshopProductIds = new Set(
            (workshopProducts || [])
                .map((row) => Number(row.product_id))
                .filter((id) => Number.isFinite(id) && id > 0)
        );

        if (workshopProductIds.size === 0) {
            return NextResponse.json([]);
        }

        const rows = await readBulvarDistributionRows();
        const filtered = rows
            .filter((row) => workshopProductIds.has(Number(row.productId)))
            .sort((a, b) => {
                if (a.productName !== b.productName) return a.productName.localeCompare(b.productName);
                return a.storeName.localeCompare(b.storeName);
            });

        return NextResponse.json(toBulvarOrderRows(filtered));
    } catch (err: any) {
        Logger.error('[bulvar Orders API] Critical Error', { error: err.message || String(err) });
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: err.message || 'An unexpected error occurred',
                code: 'INTERNAL_ERROR',
            },
            { status: 500 }
        );
    }
}
