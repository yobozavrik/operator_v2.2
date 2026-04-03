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
    serverAuditLog('VIEW_METRICS', '/api/sadova/metrics', request, {
        timestamp: new Date().toISOString()
    });

    // ✅ Одна агрегована VIEW замість обробки в Node.js
    const { data, error } = await (supabase as any)
        .schema('sadova1')
        .from('dashboard_metrics')
        .select('*')
        .maybeSingle();

    if (error) {
        Logger.error('Supabase error', { error: error.message, path: '/api/sadova/metrics' });
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

    const totalKg = (Number(data?.total_kg) || 0) / 1000;
    const criticalWeight = (Number(data?.critical_kg) || 0) / 1000;
    const highWeight = (Number(data?.high_kg) || 0) / 1000;
    const reserveWeight = (Number(data?.reserve_kg) || 0) / 1000;

    const loadPercentage = totalKg
        ? Math.min(100, Math.round((totalKg / 662) * 100))
        : 0;

    return NextResponse.json(
        {
            shopLoad: totalKg,
            criticalSKU: Number(data?.critical_sku_count) || 0,
            highSKU: Number(data?.high_sku_count) || 0,
            reserveSKU: Number(data?.reserve_sku_count) || 0,
            criticalWeight: criticalWeight,
            highWeight: highWeight,
            reserveWeight: reserveWeight,
            totalSKU: Number(data?.total_sku_count) || 0,
            loadPercentage: loadPercentage,
            staffCount: 0,
            aiEfficiency: 98,
            lastUpdate: new Date().toISOString(),
            breakdown: {
                critical: criticalWeight,
                high: highWeight,
                reserve: reserveWeight,
            },
        },
        { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } }
    );
}
