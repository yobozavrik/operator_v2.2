import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { syncPizzaLiveDataFromPoster } from '@/lib/pizza-live-sync';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function hasInternalApiAccess(request: Request): boolean {
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) return false;

    const authHeader = request.headers.get('authorization');
    const headerSecret = request.headers.get('x-internal-api-secret');

    return authHeader === `Bearer ${secret}` || headerSecret === secret;
}

export async function POST(request: Request) {
    try {
        if (!hasInternalApiAccess(request)) {
            const auth = await requireAuth();
            if (auth.error) return auth.error;
        }

        const supabase = createServiceRoleClient();
        const syncResult = await syncPizzaLiveDataFromPoster(supabase, { force: true });

        return NextResponse.json({
            success: true,
            businessDate: syncResult.businessDate,
            stockRows: syncResult.stockRows,
            stockStorages: syncResult.stockStorages,
            manufactureHeaders: syncResult.manufactureHeaders,
            manufactureItems: syncResult.manufactureItems,
            totalProductionQty: syncResult.totalProductionQty,
        });
    } catch (error: unknown) {
        Logger.error('[Pizza Sync] Critical Failure', { error: String(error) });
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}

