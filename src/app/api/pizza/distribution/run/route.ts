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
                p_user_id: auth.user.id,
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

        const businessDate = syncResult?.businessDate ?? new Date().toISOString().slice(0, 10);
        const { data: latestConfirmed, error: confirmedError } = await supabaseAdmin
            .schema('pizza1')
            .from('customer_reservations')
            .select(`
                id,
                customer_name,
                customer_reservation_items (
                    sku,
                    qty
                )
            `)
            .eq('reservation_date', businessDate)
            .eq('status', 'confirmed')
            .order('version_no', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (confirmedError) {
            Logger.error('[Pizza distribution run] failed to load latest confirmed reservation', { error: confirmedError.message });
        }

        if (latestConfirmed?.id) {
            const { data: reservationApplyResult, error: applyReservationError } = await supabaseAdmin
                .schema('pizza1')
                .rpc('fn_apply_customer_reservation', {
                    p_business_date: businessDate,
                    p_reservation_id: latestConfirmed.id,
                });

            if (applyReservationError) {
                Logger.error('[Pizza distribution run] failed to apply customer reservation', { error: applyReservationError.message });
            } else {
                Logger.info('[Pizza distribution run] customer reservation applied', {
                    meta: { businessDate, reservationId: latestConfirmed.id, result: reservationApplyResult },
                });
            }

            const { error: supersedeError } = await supabaseAdmin
                .schema('pizza1')
                .from('customer_reservations')
                .update({ status: 'superseded' })
                .eq('reservation_date', businessDate)
                .eq('customer_name', latestConfirmed.customer_name)
                .eq('status', 'used_in_distribution')
                .neq('id', latestConfirmed.id);

            if (supersedeError) {
                Logger.error('[Pizza distribution run] failed to supersede previous reservation', { error: supersedeError.message });
            }

            const { error: markUsedError } = await supabaseAdmin
                .schema('pizza1')
                .from('customer_reservations')
                .update({
                    status: 'used_in_distribution',
                })
                .eq('id', latestConfirmed.id)
                .eq('status', 'confirmed');

            if (markUsedError) {
                Logger.error('[Pizza distribution run] failed to mark reservation used', { error: markUsedError.message });
            }
        }

        return NextResponse.json({
            success: true,
            logId,
            businessDate: syncResult?.businessDate,
            stockRows: syncResult?.stockRows,
            manufactureItems: syncResult?.manufactureItems,
            totalProductionQty: syncResult?.totalProductionQty,
            reservationApplied: Boolean(latestConfirmed?.id),
            warning: syncWarning,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        Logger.error('[Pizza distribution run] API error', { error: message });
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
