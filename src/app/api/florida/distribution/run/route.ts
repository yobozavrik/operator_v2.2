import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { syncBranchProductionFromPoster } from '@/lib/branch-production-sync';
import { syncFloridaCatalogFromPoster } from '@/lib/florida-catalog';
import { syncFloridaStocksFromEdge } from '@/lib/florida-stock-sync';

export const dynamic = 'force-dynamic';

async function countTodayDistributionRows(supabaseAdmin: SupabaseClient): Promise<number> {
    const { count, error } = await supabaseAdmin
        .schema('florida1')
        .from('v_florida_today_distribution')
        .select('*', { count: 'exact', head: true });

    if (error) return 0;
    return Number(count || 0);
}

export async function POST() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
        return NextResponse.json({ error: 'Server Config Error: Missing Key' }, { status: 500 });
    }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
        { auth: { persistSession: false } }
    );

    try {
        const warnings: string[] = [];
        const productionSync = await syncBranchProductionFromPoster(supabaseAdmin, 'florida1', 41);
        if (productionSync.warning) warnings.push(`production_sync: ${productionSync.warning}`);

        try {
            await syncFloridaCatalogFromPoster(supabaseAdmin);
        } catch (catalogErr: unknown) {
            const message = catalogErr instanceof Error ? catalogErr.message : 'Unknown catalog sync error';
            warnings.push(`catalog_sync_failed: ${message}`);
        }

        try {
            const stockSync = await syncFloridaStocksFromEdge(supabaseAdmin);
            warnings.push(...stockSync.warnings.map((warning) => `stock_sync: ${warning}`));
            if (stockSync.skippedStorages.length > 0) {
                warnings.push(`stock_sync_skipped_storages: ${stockSync.skippedStorages.join(',')}`);
            }
        } catch (stockSyncErr: unknown) {
            const message = stockSyncErr instanceof Error ? stockSyncErr.message : 'Unknown stock sync error';
            warnings.push(`stock_sync_failed: ${message}`);
        }

        const { data: logId, error } = await supabaseAdmin
            .schema('florida1')
            .rpc('fn_full_recalculate_all');

        if (error) {
            if (error.code === '55P03' || error.message.includes('progress')) {
                return NextResponse.json({ error: 'Calculation is already running' }, { status: 409 });
            }
            return NextResponse.json({ error: error.message, warnings }, { status: 500 });
        }

        const todayRows = await countTodayDistributionRows(supabaseAdmin);
        return NextResponse.json({
            success: true,
            logId: logId || crypto.randomUUID(),
            mode: todayRows > 0 ? 'sql_distribution' : 'sql_empty_no_production',
            rows: todayRows,
            message: todayRows > 0
                ? `Distribution created (${todayRows} rows).`
                : 'No production available for Florida distribution today.',
            warnings,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
