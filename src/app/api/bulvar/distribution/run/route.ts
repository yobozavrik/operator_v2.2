import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { syncBranchProductionFromPoster } from '@/lib/branch-production-sync';

export const dynamic = 'force-dynamic';

export async function POST() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceKey || !supabaseUrl) {
        return NextResponse.json({ error: 'Server Config Error: Missing Supabase credentials' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false },
    });

    try {
        await syncBranchProductionFromPoster(supabaseAdmin, 'bulvar1', 22);

        const { data: batchId, error: runError } = await supabaseAdmin
            .schema('bulvar1')
            .rpc('fn_full_recalculate_all');

        if (runError) {
            if (runError.code === '55P03' || runError.message?.toLowerCase().includes('already running')) {
                return NextResponse.json({ error: 'Calculation is already running' }, { status: 409 });
            }

            return NextResponse.json(
                {
                    error: 'Distribution calculation failed',
                    message: runError.message,
                    code: 'DB_ERROR',
                },
                { status: 500 }
            );
        }

        if (!batchId) {
            return NextResponse.json({ error: 'Empty batch id returned by fn_full_recalculate_all' }, { status: 500 });
        }

        const { data: batchRows, error: summaryError } = await supabaseAdmin
            .schema('bulvar1')
            .from('distribution_results')
            .select('product_name, quantity_to_ship')
            .eq('calculation_batch_id', batchId);

        if (summaryError) {
            throw summaryError;
        }

        const safeRows = batchRows || [];
        const productsProcessed = new Set(safeRows.map((row) => row.product_name)).size;
        const totalKg = safeRows.reduce((acc, row) => acc + (Number(row.quantity_to_ship) || 0), 0);

        return NextResponse.json({
            success: true,
            batch_id: batchId,
            products_processed: productsProcessed,
            total_kg: totalKg,
            message: `Batch: ${String(batchId).slice(0, 8)} | Позицій: ${productsProcessed} | Вага: ${totalKg} кг`,
        });
    } catch (err: unknown) {
        return NextResponse.json(
            {
                error: err instanceof Error ? err.message : 'Unknown distribution error',
            },
            { status: 500 }
        );
    }
}
