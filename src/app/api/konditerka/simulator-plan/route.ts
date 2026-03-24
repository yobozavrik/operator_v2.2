import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const days = clampInt(searchParams.get('days'), 3, 1, 5);
        const capacity = clampInt(searchParams.get('capacity'), 320, 100, 800);

        const supabase = createServiceRoleClient();
        const { data, error } = await supabase.rpc('f_plan_konditerka_production_ndays', {
            p_days: days,
            p_capacity: capacity,
        });

        if (error) {
            const message = error.message || 'RPC failed';
            return NextResponse.json(
                {
                    error: message,
                    code: error.code || null,
                    details: error.details || null,
                    hint: error.hint || null,
                },
                { status: 500 }
            );
        }

        return NextResponse.json(Array.isArray(data) ? data : []);
    } catch (error: unknown) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

