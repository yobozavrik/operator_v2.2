import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { posterRequest } from '@/lib/poster-api';

export const dynamic = 'force-dynamic';

interface PosterProduct {
    product_id: string;
    category_id: string;
    payed_sum: string;
    product_profit: string;
}

export interface WeekCategoryFC {
    category_id: string;
    category_name: string;
    foodcost_pct: number;
    revenue: number;
    margin: number;
}

export interface WeekData {
    label: string;      // e.g. "10–16 бер"
    from: string;
    to: string;
    categories: WeekCategoryFC[];
    total_fc: number;
}

function fmt(d: Date): string {
    return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' }).replace(/-/g, '');
}

function weekLabel(from: Date, to: Date): string {
    const months = ['січ','лют','бер','кві','тра','чер','лип','сер','вер','жов','лис','гру'];
    const f = from.getDate();
    const t = to.getDate();
    const m = months[to.getMonth()];
    return `${f}–${t} ${m}`;
}

function getLastNWeeks(n: number): { from: Date; to: Date }[] {
    const today = new Date();
    const dow = today.getDay() || 7;
    // Last completed Sunday
    const lastSun = new Date(today);
    lastSun.setDate(today.getDate() - dow);
    lastSun.setHours(0, 0, 0, 0);

    const weeks = [];
    for (let i = 0; i < n; i++) {
        const to = new Date(lastSun);
        to.setDate(lastSun.getDate() - i * 7);
        const from = new Date(to);
        from.setDate(to.getDate() - 6);
        weeks.unshift({ from, to });
    }
    return weeks;
}

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const weeks = parseInt(searchParams.get('weeks') || '6');

    try {
        const periods = getLastNWeeks(Math.min(weeks, 8));

        const [categoriesData, ...salesResults] = await Promise.all([
            posterRequest('menu.getCategories'),
            ...periods.map(p =>
                posterRequest('dash.getProductsSales', { dateFrom: fmt(p.from), dateTo: fmt(p.to) })
            ),
        ]);

        const allCategories: { category_id: string; category_name: string }[] =
            categoriesData.response || [];
        const catNameMap = new Map(allCategories.map(c => [c.category_id, c.category_name]));

        const result: WeekData[] = periods.map((period, i) => {
            const products: PosterProduct[] = salesResults[i]?.response || [];

            // Aggregate by category
            const catMap = new Map<string, { revenue: number; margin: number }>();
            for (const p of products) {
                const revenue = Number(p.payed_sum) / 100;
                const margin = Number(p.product_profit) / 100;
                const existing = catMap.get(p.category_id);
                if (existing) {
                    existing.revenue += revenue;
                    existing.margin += margin;
                } else {
                    catMap.set(p.category_id, { revenue, margin });
                }
            }

            const categories: WeekCategoryFC[] = [];
            let totalRevenue = 0, totalCost = 0;

            catMap.forEach(({ revenue, margin }, catId) => {
                const cost = revenue - margin;
                const foodcost_pct = revenue > 0 ? (cost / revenue) * 100 : 0;
                totalRevenue += revenue;
                totalCost += cost;
                categories.push({
                    category_id: catId,
                    category_name: catNameMap.get(catId) || catId,
                    foodcost_pct,
                    revenue,
                    margin,
                });
            });

            categories.sort((a, b) => b.revenue - a.revenue);

            return {
                label: weekLabel(period.from, period.to),
                from: fmt(period.from),
                to: fmt(period.to),
                categories,
                total_fc: totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0,
            };
        });

        return NextResponse.json(result);
    } catch (err: unknown) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 }
        );
    }
}
