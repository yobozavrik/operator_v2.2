import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/branch-api';
import { syncPizzaLiveDataFromPoster } from '@/lib/pizza-live-sync';

export const dynamic = 'force-dynamic';
const PIZZA_LIVE_SYNC_TIMEOUT_MS = 5000;

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabase = createServiceRoleClient();

        await Promise.race([
            syncPizzaLiveDataFromPoster(supabase),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('sync timeout')), PIZZA_LIVE_SYNC_TIMEOUT_MS)
            ),
        ]).catch((error) => {
            Logger.error('[pizza Orders API] live sync failed', { error: String(error) });
            return null;
        });

        const { data, error } = await supabase
            .schema('pizza1')
            .from('v_pizza_distribution_stats')
            .select('*');

        Logger.info("Данные из БД по пицце", { meta: { count: data?.length, firstRow: data?.[0] } });

        if (error) {
            Logger.error('Supabase Pizza API error', { error: error.message });
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        Logger.error('Critical Pizza API Error', { error: err.message || String(err) });
        return NextResponse.json({
            error: 'Internal Server Error',
            message: err.message
        }, { status: 500 });
    }
}
