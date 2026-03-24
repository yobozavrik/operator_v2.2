import { NextRequest, NextResponse } from 'next/server';
import { serverAuditLog } from '@/lib/logger.server';
import { Logger } from '@/lib/logger';
import { createClient } from '@/utils/supabase/server';
import { requireAuth } from '@/lib/auth-guard';
import { SupabaseDeficitRow } from '@/types/bi';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await createClient();

    // Log API access (non-blocking)
    serverAuditLog('VIEW_DEFICIT', '/api/graviton/deficit', request, {
        timestamp: new Date().toISOString()
    });

    const { data, error } = await supabase
        .from('dashboard_deficit')
        .select('*')
        .in('priority_number', [1, 2, 3])
        .order('priority_number', { ascending: true })
        .order('deficit_percent', { ascending: false })
        .limit(1000);

    if (error) {
        Logger.error('Supabase error', { error: error.message, path: '/api/graviton/deficit' });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Отримуємо довідник порційності
    const { data: catalog } = await (supabase as any)
        .schema('graviton')
        .from('production_catalog')
        .select('product_id, portion_size, unit');

    const portionMap = new Map();
    if (catalog) {
        catalog.forEach((item: any) => {
            portionMap.set(String(item.product_id), {
                size: item.portion_size,
                unit: item.unit
            });
        });
    }

    // Нормалізація для фронтенду
    const mappedData = (data || []).map(row => {
        const portion = portionMap.get(String(row.код_продукту));
        return {
            ...row,
            priority: row.priority_number === 1 ? 'critical' :
                row.priority_number === 2 ? 'high' :
                    row.priority_number === 3 ? 'reserve' : 'normal',
            portion_size: portion?.size || 0,
            portion_unit: portion?.unit || 'кг'
        } as SupabaseDeficitRow;
    });

    return NextResponse.json(mappedData);
}
