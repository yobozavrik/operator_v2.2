import { NextRequest, NextResponse } from 'next/server';
import { serverAuditLog } from '@/lib/logger.server';
import { createClient } from '@/utils/supabase/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await createClient();

    // Логуємо звернення до API
    await serverAuditLog('VIEW_RESERVE_DEFICIT', '/api/graviton/deficit/reserve', request, {
        timestamp: new Date().toISOString()
    });

    const { data, error } = await supabase
        .from('dashboard_deficit')
        .select('*')
        .eq('priority_number', 3)  // Тільки РЕЗЕРВ
        .order('deficit_percent', { ascending: false });

    if (error) {
        console.error('Supabase error:', error);
        await serverAuditLog('ERROR', '/api/graviton/deficit/reserve', request, {
            error: error.message
        });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Приводимо типи та нормалізуємо дані для фронтенду (Step 95)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mappedData = (data || []).map((row: any) => ({
        ...row,
        priority: 'reserve',
        priority_number: 3
    }));

    return NextResponse.json(mappedData);
}
