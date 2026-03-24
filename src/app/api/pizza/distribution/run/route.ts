import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { syncPizzaLiveDataFromPoster } from '@/lib/pizza-live-sync';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabaseAdmin = createServiceRoleClient();

    try {
        const DEV_USER_ID = '00000000-0000-0000-0000-000000000000';
        let syncResult:
            | {
                businessDate: string;
                stockRows: number;
                manufactureItems: number;
                totalProductionQty: number;
            }
            | null = null;
        let syncWarning: string | undefined;

        try {
            const live = await syncPizzaLiveDataFromPoster(supabaseAdmin);
            syncResult = {
                businessDate: live.businessDate,
                stockRows: live.stockRows,
                manufactureItems: live.manufactureItems,
                totalProductionQty: live.totalProductionQty,
            };
        } catch (error) {
            syncWarning = error instanceof Error ? error.message : String(error);
            Logger.warn('[Pizza distribution run] live sync skipped', { error: syncWarning });
        }

        const { data: logId, error } = await supabaseAdmin
            .schema('pizza1')
            .rpc('fn_full_recalculate_all', {
            p_user_id: DEV_USER_ID
        });

        if (error) {
            Logger.error('[Pizza distribution run] RPC error', { error: error.message });

            if (error.code === '55P03' || error.message.includes('progress')) {
                return NextResponse.json({ error: 'Calculation is already running' }, { status: 409 });
            }
            if (error.message.includes('Data Integrity Error')) {
                return NextResponse.json({ error: 'Validation Failed: Zero products distributed.' }, { status: 422 });
            }
            throw error;
        }

        return NextResponse.json({
            success: true,
            logId,
            businessDate: syncResult?.businessDate,
            stockRows: syncResult?.stockRows,
            manufactureItems: syncResult?.manufactureItems,
            totalProductionQty: syncResult?.totalProductionQty,
            warning: syncWarning,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        Logger.error('[Pizza distribution run] API error', { error: message });
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
