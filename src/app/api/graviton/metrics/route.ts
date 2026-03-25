import { NextRequest, NextResponse } from 'next/server';
import { serverAuditLog } from '@/lib/logger.server';
import { Logger } from '@/lib/logger';
import { createClient } from '@/utils/supabase/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await createClient();

    // Log API access (non-blocking)
    serverAuditLog('VIEW_METRICS', '/api/graviton/metrics', request, {
        timestamp: new Date().toISOString()
    });

    // ✅ Одна агрегована VIEW замість обробки в Node.js
    const { data, error } = await supabase
        .from('dashboard_metrics')
        .select('*')
        .maybeSingle();

    if (error) {
        Logger.error('Supabase error', { error: error.message, path: '/api/graviton/metrics' });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
        return NextResponse.json({
            totalKg: 0,
            criticalSKU: 0,
            loadPercentage: 0,
            breakdown: {
                critical: 0,
                high: 0,
                reserve: 0
            }
        });
    }

    const totalKg = Number(data?.total_kg) || 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const criticalSKU = Number(data?.critical_sku_count) || 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const highSKU = Number(data?.high_sku_count) || 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const loadPercentage = totalKg
        ? Math.min(100, Math.round((totalKg / 662) * 100))
        : 0;

    return NextResponse.json(
        {
            shopLoad: Number(data?.total_kg) || 0,
            criticalSKU: Number(data?.critical_sku_count) || 0,
            highSKU: Number(data?.high_sku_count) || 0,
            reserveSKU: Number(data?.reserve_sku_count) || 0,
            criticalWeight: Number(data?.critical_kg) || 0,
            highWeight: Number(data?.high_kg) || 0,
            reserveWeight: Number(data?.reserve_kg) || 0,
            totalSKU: Number(data?.total_sku_count) || 0,
            loadPercentage: Math.min(100, Math.round((Number(data?.total_kg || 0) / 662) * 100)),
            staffCount: 0,
            aiEfficiency: 98,
            lastUpdate: new Date().toISOString(),
            breakdown: {
                critical: Number(data?.critical_kg) || 0,
                high: Number(data?.high_kg) || 0,
                reserve: Number(data?.reserve_kg) || 0,
            },
        },
        { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } }
    );
}
