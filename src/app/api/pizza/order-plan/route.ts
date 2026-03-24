import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { syncPizzaLiveDataFromPoster } from '@/lib/pizza-live-sync';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '1');

    try {
        const supabase = createServiceRoleClient();
        await syncPizzaLiveDataFromPoster(supabase).catch((error) => {
            Logger.error('[pizza order-plan] live sync failed', { error: String(error) });
            return null;
        });

        // OLD (до 13.02.2026): использовал только физические остатки
        // const { data, error } = await supabase.rpc('f_generate_order_plan', { p_days: days });

        // NEW (с 13.02.2026): учитывает виртуальные остатки (pending распределение)
        const { data, error } = await supabase.rpc('f_generate_order_plan_v2', { p_days: days });

        if (error) {
            console.error('RPC Error:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
