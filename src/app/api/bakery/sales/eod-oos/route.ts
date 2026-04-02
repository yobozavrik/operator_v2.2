import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { loadCraftBreadEodOos } from '@/lib/bakery-oos';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');

        const date = dateParam
            ? dateParam
            : (() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 1);
                  return d.toISOString().slice(0, 10);
              })();

        if (!DATE_RE.test(date)) {
            return NextResponse.json({ error: 'Invalid date format, expected YYYY-MM-DD' }, { status: 400 });
        }

        const pivot = await loadCraftBreadEodOos(date);
        return NextResponse.json(pivot);
    } catch (err: any) {
        Logger.error('Bakery eod-oos API error', { error: err?.message || String(err) });
        return NextResponse.json(
            { error: 'Internal Server Error', message: err?.message || String(err) },
            { status: 500 }
        );
    }
}

