import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { posterRequest } from '@/lib/poster-api';

export const dynamic = 'force-dynamic';

interface PosterSupply {
    supply_id: string;
    supplier_id: string;
    supplier_name: string;
    date: string;
    supply_sum: string; // kopecks
}

interface PosterSupplyDetail {
    supply_id: number;
    supplier_name: string;
    date: string;
    supply_sum: string; // UAH
    ingredients: Array<{
        ingredient_id: number;
        ingredient_name: string;
        ingredient_unit: string;
        supply_ingredient_num: number;
        supply_ingredient_sum: string;
    }>;
}

export interface SupplierRow {
    supplier_id: string;
    supplier_name: string;
    supply_count: number;
    total_amount: number; // UAH
}

export interface IngredientRow {
    ingredient_id: number;
    ingredient_name: string;
    unit: string;
    category: string;
    qty: number;
    amount: number; // UAH
    price_per_unit: number;
    qty_prev: number;
    amount_prev: number;
    price_per_unit_prev: number;
    price_delta: number; // UAH
}

function categorizeIngredient(name: string): string {
    const n = name.toLowerCase();
    if (/борошно|крохмаль|манка|крупа|вівсян|тісто|пшениця|кукурудзян/.test(n)) return 'Борошно та крупи';
    if (/свинин|яловичин|курят|куриц|фарш|сало|печінк|телят|м\'яс|шия|карбонад|ребр|грудк/.test(n)) return 'М\'ясо та птиця';
    if (/риб|хек|скумбр|минтай|форел|лосос|тунец|краб|креветк/.test(n)) return 'Риба';
    if (/молоко|сир|сметан|вершк|масло|бринз|пармез|творог|рикот|моцарел|йогурт/.test(n)) return 'Молочні продукти';
    if (/яйц/.test(n)) return 'Яйця';
    if (/картопл|цибул|морква|капуст|гриб|буряк|часник|перець болг|огірок|томат|помідор|броколі|кабачок/.test(n)) return 'Овочі';
    if (/яблук|вишн|чорниц|малин|полуниц|груш|слив|абрикос|банан|лимон|апельсин/.test(n)) return 'Фрукти та ягоди';
    if (/олія|маргарин|жир/.test(n)) return 'Олія та жири';
    if (/сіль|цукор|перець|приправ|спец|оцет|соус|крем|ванілін|розпушувач|дріждж|желатин|крохмал/.test(n)) return 'Спеції та добавки';
    if (/пакет|плівк|контейнер|зіп|упаковк|тара|кришк|лоток|стакан|форм/.test(n)) return 'Пакування';
    return 'Інше';
}

function parsePeriod(period: string): { from: string; to: string; prevFrom: string; prevTo: string } {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

    const monday = (d: Date) => {
        const day = d.getDay() || 7;
        const m = new Date(d);
        m.setDate(d.getDate() - day + 1);
        m.setHours(0, 0, 0, 0);
        return m;
    };

    if (period === 'last_week') {
        const lastMon = monday(now);
        lastMon.setDate(lastMon.getDate() - 7);
        const lastSun = new Date(lastMon);
        lastSun.setDate(lastMon.getDate() + 6);
        const prevMon = new Date(lastMon);
        prevMon.setDate(lastMon.getDate() - 7);
        const prevSun = new Date(prevMon);
        prevSun.setDate(prevMon.getDate() + 6);
        return { from: fmt(lastMon), to: fmt(lastSun), prevFrom: fmt(prevMon), prevTo: fmt(prevSun) };
    }

    // last_7 days default
    const to = new Date(now);
    to.setDate(now.getDate() - 1);
    const from = new Date(to);
    from.setDate(to.getDate() - 6);
    const prevTo = new Date(from);
    prevTo.setDate(from.getDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevTo.getDate() - 6);
    return { from: fmt(from), to: fmt(to), prevFrom: fmt(prevFrom), prevTo: fmt(prevTo) };
}

function inRange(dateStr: string, from: string, to: string): boolean {
    const d = dateStr.replace(/-/g, '').slice(0, 8);
    return d >= from && d <= to;
}

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'last_week';
    const { from, to, prevFrom, prevTo } = parsePeriod(period);

    try {
        const allSupplies: PosterSupply[] = (await posterRequest('storage.getSupplies'))?.response || [];

        // Filter by current and previous periods
        const current = allSupplies.filter(s => inRange(s.date, from, to));
        const previous = allSupplies.filter(s => inRange(s.date, prevFrom, prevTo));

        // Aggregate current by supplier
        const currBySupplier = new Map<string, SupplierRow>();
        for (const s of current) {
            const existing = currBySupplier.get(s.supplier_id);
            const amount = parseInt(s.supply_sum) / 100;
            if (existing) {
                existing.supply_count++;
                existing.total_amount += amount;
            } else {
                currBySupplier.set(s.supplier_id, {
                    supplier_id: s.supplier_id,
                    supplier_name: s.supplier_name,
                    supply_count: 1,
                    total_amount: amount,
                });
            }
        }

        // Aggregate previous by supplier
        const prevBySupplier = new Map<string, number>();
        for (const s of previous) {
            const prev = prevBySupplier.get(s.supplier_id) || 0;
            prevBySupplier.set(s.supplier_id, prev + parseInt(s.supply_sum) / 100);
        }

        const suppliers = Array.from(currBySupplier.values())
            .sort((a, b) => b.total_amount - a.total_amount)
            .map(s => ({ ...s, prev_amount: prevBySupplier.get(s.supplier_id) || 0 }));

        // Fetch ingredient details for top 40 supplies by amount (current period)
        const topSupplies = current
            .sort((a, b) => parseInt(b.supply_sum) - parseInt(a.supply_sum))
            .slice(0, 40);

        const details = await Promise.all(
            topSupplies.map(s =>
                posterRequest('storage.getSupply', { supply_id: String(s.supply_id) })
                    .then(r => r?.response as PosterSupplyDetail | null)
                    .catch(() => null)
            )
        );

        // Aggregate ingredients from current period top supplies
        const currIngMap = new Map<number, IngredientRow>();
        for (const detail of details) {
            if (!detail?.ingredients) continue;
            for (const ing of detail.ingredients) {
                const amount = parseFloat(ing.supply_ingredient_sum) || 0;
                const qty = ing.supply_ingredient_num || 0;
                const existing = currIngMap.get(ing.ingredient_id);
                if (existing) {
                    existing.qty += qty;
                    existing.amount += amount;
                } else {
                    currIngMap.set(ing.ingredient_id, {
                        ingredient_id: ing.ingredient_id,
                        ingredient_name: ing.ingredient_name,
                        unit: ing.ingredient_unit === 'kg' ? 'кг' : ing.ingredient_unit,
                        category: categorizeIngredient(ing.ingredient_name),
                        qty,
                        amount,
                        price_per_unit: qty > 0 ? amount / qty : 0,
                        qty_prev: 0,
                        amount_prev: 0,
                        price_per_unit_prev: 0,
                        price_delta: 0,
                    });
                }
            }
        }

        // Fetch prev period top 40 supplies for comparison
        const prevTopSupplies = previous
            .sort((a, b) => parseInt(b.supply_sum) - parseInt(a.supply_sum))
            .slice(0, 40);

        const prevDetails = await Promise.all(
            prevTopSupplies.map(s =>
                posterRequest('storage.getSupply', { supply_id: String(s.supply_id) })
                    .then(r => r?.response as PosterSupplyDetail | null)
                    .catch(() => null)
            )
        );

        const prevIngMap = new Map<number, { qty: number; amount: number }>();
        for (const detail of prevDetails) {
            if (!detail?.ingredients) continue;
            for (const ing of detail.ingredients) {
                const amount = parseFloat(ing.supply_ingredient_sum) || 0;
                const qty = ing.supply_ingredient_num || 0;
                const existing = prevIngMap.get(ing.ingredient_id);
                if (existing) {
                    existing.qty += qty;
                    existing.amount += amount;
                } else {
                    prevIngMap.set(ing.ingredient_id, { qty, amount });
                }
            }
        }

        // Enrich with prev period data
        const ingredients: IngredientRow[] = Array.from(currIngMap.values()).map(ing => {
            const prev = prevIngMap.get(ing.ingredient_id);
            const price_per_unit_prev = prev && prev.qty > 0 ? prev.amount / prev.qty : 0;
            return {
                ...ing,
                qty_prev: prev?.qty || 0,
                amount_prev: prev?.amount || 0,
                price_per_unit_prev,
                price_delta: ing.price_per_unit - price_per_unit_prev,
            };
        }).sort((a, b) => b.amount - a.amount);

        return NextResponse.json({
            period: { from, to, prevFrom, prevTo },
            suppliers,
            ingredients,
            supply_count_current: current.length,
            supply_count_previous: previous.length,
            total_current: current.reduce((s, x) => s + parseInt(x.supply_sum) / 100, 0),
            total_previous: previous.reduce((s, x) => s + parseInt(x.supply_sum) / 100, 0),
        });

    } catch (err: unknown) {
        console.error('Supply API error:', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
}
