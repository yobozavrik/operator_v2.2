import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { coercePositiveInt } from '@/lib/branch-api';
import {
    buildCraftBreadSalesWorkbook,
    buildSalesFileName,
    isSingleDayRange,
    loadCraftBreadSalesPivot,
} from '@/lib/bakery-sales-pivot';
import { loadCraftBreadEodOos } from '@/lib/bakery-oos';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const startDateParam = searchParams.get('start_date');
        const endDateParam = searchParams.get('end_date');
        const days = coercePositiveInt(searchParams.get('days'), 14, 1, 365);

        if (startDateParam && !DATE_RE.test(startDateParam)) {
            return NextResponse.json({ error: 'Invalid start_date format, expected YYYY-MM-DD' }, { status: 400 });
        }
        if (endDateParam && !DATE_RE.test(endDateParam)) {
            return NextResponse.json({ error: 'Invalid end_date format, expected YYYY-MM-DD' }, { status: 400 });
        }

        let startDate: string;
        let endDate: string;

        if (startDateParam && endDateParam) {
            startDate = startDateParam;
            endDate = endDateParam;
        } else {
            const end = new Date();
            const start = new Date();
            end.setDate(end.getDate() - 1);
            start.setDate(end.getDate() - (days - 1));
            startDate = start.toISOString().slice(0, 10);
            endDate = end.toISOString().slice(0, 10);
        }

        const pivot = await loadCraftBreadSalesPivot(startDate, endDate);
        const oos = isSingleDayRange(startDate, endDate) ? await loadCraftBreadEodOos(startDate) : null;
        const buffer = await buildCraftBreadSalesWorkbook(pivot, { oos });

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${buildSalesFileName(startDate, endDate)}"`,
            },
        });
    } catch (err: any) {
        Logger.error('Bakery sales export API error', { error: err?.message || String(err) });
        return NextResponse.json(
            { error: 'Failed to generate excel export', message: err?.message || String(err) },
            { status: 500 }
        );
    }
}

