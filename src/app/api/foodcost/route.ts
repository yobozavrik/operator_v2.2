import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { posterRequest } from '@/lib/poster-api';

export const dynamic = 'force-dynamic';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PosterProduct {
    product_id: string;
    product_name: string;
    category_id: string;
    count: string;
    weight_flag: string;
    payed_sum: string;
    product_profit: string;
    unit: string;
}

interface PosterCategory {
    category_id: string;
    category_name: string;
    parent_category: string;
}

export interface ProductMetrics {
    product_id: string;
    product_name: string;
    category_id: string;
    qty: number;
    unit: string;
    revenue: number;
    cost: number;
    margin: number;
    foodcost_pct: number;
    price: number;
    // vs previous period
    revenue_prev: number;
    cost_prev: number;
    margin_prev: number;
    foodcost_pct_prev: number;
    foodcost_delta: number;
    margin_delta_pct: number;
}

export interface CategoryMetrics {
    category_id: string;
    category_name: string;
    revenue: number;
    cost: number;
    margin: number;
    foodcost_pct: number;
    foodcost_pct_prev: number;
    foodcost_delta: number;
    margin_delta_pct: number;
    products: ProductMetrics[];
}

export interface FoodCostSummary {
    revenue: number;
    cost: number;
    margin: number;
    foodcost_pct: number;
    revenue_prev: number;
    cost_prev: number;
    margin_prev: number;
    foodcost_pct_prev: number;
    revenue_delta_pct: number;
    cost_delta_pct: number;
    margin_delta_pct: number;
    foodcost_delta: number;
}

export interface Recommendation {
    priority: 'critical' | 'important' | 'opportunity';
    type: string;
    product_name: string;
    description: string;
    monthly_impact: number;
    current_price?: number;
    suggested_price?: number;
}

export interface SparkPoint {
    week: string;
    revenue: number;
    cost: number;
    margin: number;
    foodcost_pct: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toUAH(kopecks: string | number): number {
    return Number(kopecks) / 100;
}

function calcMetrics(revenue: number, profit: number) {
    const cost = revenue - profit;
    const foodcost_pct = revenue > 0 ? (cost / revenue) * 100 : 0;
    return { cost, foodcost_pct };
}

function formatYYYYMMDD(date: Date): string {
    return date.toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' }).replace(/-/g, '');
}

function getKyivDate(date = new Date()): Date {
    // Return date adjusted to Kyiv timezone
    const kyivStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(date);
    return new Date(kyivStr);
}

function getPeriodDates(period: string): { from: Date; to: Date } {
    const today = getKyivDate();

    if (period === 'last_week') {
        // Previous Mon–Sun
        const dow = today.getDay() || 7; // 1=Mon, 7=Sun
        const lastSun = new Date(today);
        lastSun.setDate(today.getDate() - dow);
        const lastMon = new Date(lastSun);
        lastMon.setDate(lastSun.getDate() - 6);
        return { from: lastMon, to: lastSun };
    }
    if (period === 'last_2_weeks') {
        const dow = today.getDay() || 7;
        const lastSun = new Date(today);
        lastSun.setDate(today.getDate() - dow);
        const twoWeeksAgoMon = new Date(lastSun);
        twoWeeksAgoMon.setDate(lastSun.getDate() - 13);
        return { from: twoWeeksAgoMon, to: lastSun };
    }
    if (period === 'last_7') {
        const to = new Date(today);
        to.setDate(today.getDate() - 1);
        const from = new Date(to);
        from.setDate(to.getDate() - 6);
        return { from, to };
    }
    if (period === 'last_14') {
        const to = new Date(today);
        to.setDate(today.getDate() - 1);
        const from = new Date(to);
        from.setDate(to.getDate() - 13);
        return { from, to };
    }
    if (period === 'last_month') {
        const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const to = new Date(today.getFullYear(), today.getMonth(), 0);
        return { from, to };
    }
    // default: last_week
    return getPeriodDates('last_week');
}

function getPrevPeriod(from: Date, to: Date): { from: Date; to: Date } {
    const diffMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
    const prevFrom = new Date(prevTo.getTime() - diffMs);
    return { from: prevFrom, to: prevTo };
}

// ─── Recommendations (rule-based) ────────────────────────────────────────────

function generateRecommendations(categories: CategoryMetrics[]): Recommendation[] {
    const recs: Recommendation[] = [];
    const TARGET_FC = 40;
    const CRITICAL_FC = 50;

    for (const cat of categories) {
        for (const p of cat.products) {
            if (p.revenue === 0) continue;

            // 1. Critical: FC > 50% — raise price
            if (p.foodcost_pct > CRITICAL_FC && p.revenue > 0) {
                const targetFc = TARGET_FC / 100;
                // Suggested price = cost_per_unit / target_fc
                const costPerUnit = p.qty > 0 ? p.cost / p.qty : 0;
                const sugPrice = costPerUnit > 0 ? Math.ceil(costPerUnit / targetFc) : p.price;
                const priceDiff = sugPrice - p.price;
                const weeklyImpact = priceDiff * p.qty; // qty is for the selected period (week)

                recs.push({
                    priority: 'critical',
                    type: 'Коригування ціни',
                    product_name: p.product_name,
                    description: `Фудкост ${p.foodcost_pct.toFixed(1)}% перевищує цільовий показник ${TARGET_FC}%. Собівартість ${(p.cost / Math.max(p.qty, 1)).toFixed(0)} грн/${p.unit}. Рекомендується підвищити ціну на ${((sugPrice / p.price - 1) * 100).toFixed(1)}% (з ${p.price} до ${sugPrice} грн) для захисту маржі.`,
                    monthly_impact: weeklyImpact > 0 ? weeklyImpact : 0,
                    current_price: p.price,
                    suggested_price: sugPrice,
                });
            }
            // 2. Important: FC between 40–50%
            else if (p.foodcost_pct >= TARGET_FC && p.foodcost_pct <= CRITICAL_FC && p.revenue > 1000) {
                const costPerUnit = p.qty > 0 ? p.cost / p.qty : 0;
                const targetPrice = costPerUnit > 0 ? Math.ceil(costPerUnit / (TARGET_FC / 100)) : p.price;
                const priceDiff = targetPrice - p.price;
                const weeklyImpact = Math.max(0, priceDiff * p.qty);

                recs.push({
                    priority: 'important',
                    type: 'Оптимізація ціни',
                    product_name: p.product_name,
                    description: `Фудкост ${p.foodcost_pct.toFixed(1)}% перевищує цільовий показник ${TARGET_FC}%. Розгляньте підвищення ціни або оптимізацію рецептури.`,
                    monthly_impact: weeklyImpact,
                    current_price: p.price,
                    suggested_price: targetPrice,
                });
            }
            // 3. Opportunity: FC < 30% and high sales (good margin, good volume) — promote
            else if (p.foodcost_pct < 30 && p.revenue > 5000 && p.margin_delta_pct > 0) {
                const extraRevenue = p.revenue * 0.15; // 15% more with promotion
                const extraMargin = extraRevenue * (1 - p.foodcost_pct / 100);

                recs.push({
                    priority: 'opportunity',
                    type: 'Активні продажі',
                    product_name: p.product_name,
                    description: `Висока маржинальність ${(100 - p.foodcost_pct).toFixed(1)}% та зростаючий тренд. Рекомендується активне просування для збільшення виручки.`,
                    monthly_impact: Math.round(extraMargin),
                });
            }
        }

        // 4. Category with negative margin
        if (cat.margin < -1000) {
            recs.push({
                priority: 'critical',
                type: 'Аналіз категорії',
                product_name: cat.category_name,
                description: `Категорія має від'ємну маржу ${(cat.margin / 1000).toFixed(1)} тис. грн та фудкост ${cat.foodcost_pct.toFixed(1)}%. Необхідний терміновий перегляд ціноутворення або виключення збиткових позицій.`,
                monthly_impact: Math.abs(cat.margin),
            });
        }
    }

    // Sort: critical first, then by monthly_impact desc
    const order = { critical: 0, important: 1, opportunity: 2 };
    recs.sort((a, b) => order[a.priority] - order[b.priority] || b.monthly_impact - a.monthly_impact);

    return recs.slice(0, 12);
}

// ─── Analysis text (rule-based) ───────────────────────────────────────────────

function generateAnalysis(summary: FoodCostSummary, categories: CategoryMetrics[]): { drivers: string[]; problems: string[] } {
    const drivers: string[] = [];
    const problems: string[] = [];

    // Overall trend
    if (summary.foodcost_delta !== 0) {
        const dir = summary.foodcost_delta > 0 ? 'зріс' : 'знизився';
        const dirM = summary.margin_delta_pct > 0 ? 'збільшилась' : 'зменшилась';
        drivers.push(
            `Загальний фудкост ${dir} на ${Math.abs(summary.foodcost_delta).toFixed(2)} в.п. до ${summary.foodcost_pct.toFixed(1)}%, маржа ${dirM} на ${Math.abs(summary.margin_delta_pct).toFixed(1)}% при ${summary.revenue_delta_pct > 0 ? 'зростанні' : 'падінні'} обсягів продажів на ${Math.abs(summary.revenue_delta_pct).toFixed(1)}%.`
        );
    }

    // Top margin contributors
    const topMargin = [...categories].sort((a, b) => b.margin - a.margin).slice(0, 2);
    if (topMargin.length > 0) {
        const names = topMargin.map(c => `«${c.category_name}» (+${(c.margin / 1000).toFixed(1)} тис. грн)`).join(' та ');
        drivers.push(`Зміна структури продажів — основний приріст маржі забезпечили категорії ${names}.`);
    }

    // Rising FC categories
    const risingFC = categories.filter(c => c.foodcost_delta > 1 && c.revenue > 10000);
    if (risingFC.length > 0) {
        const name = risingFC[0];
        drivers.push(`Зміна цін постачання — зафіксовано зростання собівартості в категорії «${name.category_name}» (ФК: ${name.foodcost_pct_prev.toFixed(1)}% → ${name.foodcost_pct.toFixed(1)}%).`);
    }

    // Negative margin categories
    const negMargin = categories.filter(c => c.margin < 0);
    negMargin.forEach(c => {
        problems.push(
            `Від'ємна маржа та високий фудкост — категорія «${c.category_name}» має критичний фудкост ${c.foodcost_pct.toFixed(1)}% та від'ємну маржу (${(c.margin / 1000).toFixed(1)} тис. грн).`
        );
    });

    // High FC products
    const highFcProducts: { name: string; fc: number }[] = [];
    categories.forEach(c => {
        c.products.forEach(p => {
            if (p.foodcost_pct > 50 && p.revenue > 500) {
                highFcProducts.push({ name: p.product_name, fc: p.foodcost_pct });
            }
        });
    });
    if (highFcProducts.length > 0) {
        const names = highFcProducts.slice(0, 4).map(p => `«${p.name}» (${p.fc.toFixed(1)}%)`).join(', ');
        problems.push(`Високий фудкост (>50%) — ${names}.`);
    }

    // Falling margin categories
    const fallingMargin = categories.filter(c => c.margin_delta_pct < -5 && c.revenue > 10000);
    fallingMargin.slice(0, 2).forEach(c => {
        problems.push(`Спад продажів — у категорії «${c.category_name}» спостерігається падіння маржі на ${Math.abs(c.margin_delta_pct).toFixed(1)}%.`);
    });

    return { drivers, problems };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || 'last_week';

        const { from, to } = getPeriodDates(period);
        const { from: prevFrom, to: prevTo } = getPrevPeriod(from, to);

        const dateFrom = formatYYYYMMDD(from);
        const dateTo = formatYYYYMMDD(to);
        const prevDateFrom = formatYYYYMMDD(prevFrom);
        const prevDateTo = formatYYYYMMDD(prevTo);

        // Fetch in parallel
        const [currentData, prevData, categoriesData] = await Promise.all([
            posterRequest('dash.getProductsSales', { dateFrom, dateTo }),
            posterRequest('dash.getProductsSales', { dateFrom: prevDateFrom, dateTo: prevDateTo }),
            posterRequest('menu.getCategories'),
        ]);

        const currentProducts: PosterProduct[] = currentData.response || [];
        const prevProducts: PosterProduct[] = prevData.response || [];
        const allCategories: PosterCategory[] = categoriesData.response || [];

        // Index previous period by product_id
        const prevMap = new Map<string, PosterProduct>();
        prevProducts.forEach(p => prevMap.set(p.product_id, p));

        // Category name map
        const catNameMap = new Map<string, string>();
        allCategories.forEach(c => catNameMap.set(c.category_id, c.category_name));

        // Group products by category
        const catMap = new Map<string, ProductMetrics[]>();

        let totalRevenue = 0, totalCost = 0, totalMargin = 0;
        let totalRevenuePrev = 0, totalCostPrev = 0, totalMarginPrev = 0;

        for (const p of currentProducts) {
            const revenue = toUAH(p.payed_sum);
            const margin = toUAH(p.product_profit);
            const { cost, foodcost_pct } = calcMetrics(revenue, margin);

            const prev = prevMap.get(p.product_id);
            const revenuePrev = prev ? toUAH(prev.payed_sum) : 0;
            const marginPrev = prev ? toUAH(prev.product_profit) : 0;
            const { cost: costPrev, foodcost_pct: foodcostPrev } = calcMetrics(revenuePrev, marginPrev);

            const qty = parseFloat(p.count) || 0;
            const price = qty > 0 ? Math.round(revenue / qty) : 0;

            const pm: ProductMetrics = {
                product_id: p.product_id,
                product_name: p.product_name,
                category_id: p.category_id,
                qty,
                unit: p.weight_flag === '1' ? 'кг' : 'шт',
                revenue,
                cost,
                margin,
                foodcost_pct,
                price,
                revenue_prev: revenuePrev,
                cost_prev: costPrev,
                margin_prev: marginPrev,
                foodcost_pct_prev: foodcostPrev,
                foodcost_delta: foodcost_pct - foodcostPrev,
                margin_delta_pct: marginPrev !== 0 ? ((margin - marginPrev) / Math.abs(marginPrev)) * 100 : 0,
            };

            if (!catMap.has(p.category_id)) catMap.set(p.category_id, []);
            catMap.get(p.category_id)!.push(pm);

            totalRevenue += revenue;
            totalCost += cost;
            totalMargin += margin;
            totalRevenuePrev += revenuePrev;
            totalCostPrev += costPrev;
            totalMarginPrev += marginPrev;
        }

        // Build category metrics
        const categories: CategoryMetrics[] = [];
        catMap.forEach((products, catId) => {
            const catRevenue = products.reduce((s, p) => s + p.revenue, 0);
            const catCost = products.reduce((s, p) => s + p.cost, 0);
            const catMargin = products.reduce((s, p) => s + p.margin, 0);
            const catFc = catRevenue > 0 ? (catCost / catRevenue) * 100 : 0;

            const catRevenuePrev = products.reduce((s, p) => s + p.revenue_prev, 0);
            const catCostPrev = products.reduce((s, p) => s + p.cost_prev, 0);
            const catMarginPrev = products.reduce((s, p) => s + p.margin_prev, 0);
            const catFcPrev = catRevenuePrev > 0 ? (catCostPrev / catRevenuePrev) * 100 : 0;

            // Sort products by margin desc
            products.sort((a, b) => b.margin - a.margin);

            categories.push({
                category_id: catId,
                category_name: catNameMap.get(catId) || `Категорія ${catId}`,
                revenue: catRevenue,
                cost: catCost,
                margin: catMargin,
                foodcost_pct: catFc,
                foodcost_pct_prev: catFcPrev,
                foodcost_delta: catFc - catFcPrev,
                margin_delta_pct: catMarginPrev !== 0 ? ((catMargin - catMarginPrev) / Math.abs(catMarginPrev)) * 100 : 0,
                products,
            });
        });

        // Sort categories by margin desc
        categories.sort((a, b) => b.margin - a.margin);

        // Summary
        const fcPct = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;
        const fcPctPrev = totalRevenuePrev > 0 ? (totalCostPrev / totalRevenuePrev) * 100 : 0;

        const summary: FoodCostSummary = {
            revenue: totalRevenue,
            cost: totalCost,
            margin: totalMargin,
            foodcost_pct: fcPct,
            revenue_prev: totalRevenuePrev,
            cost_prev: totalCostPrev,
            margin_prev: totalMarginPrev,
            foodcost_pct_prev: fcPctPrev,
            revenue_delta_pct: totalRevenuePrev !== 0 ? ((totalRevenue - totalRevenuePrev) / totalRevenuePrev) * 100 : 0,
            cost_delta_pct: totalCostPrev !== 0 ? ((totalCost - totalCostPrev) / Math.abs(totalCostPrev)) * 100 : 0,
            margin_delta_pct: totalMarginPrev !== 0 ? ((totalMargin - totalMarginPrev) / Math.abs(totalMarginPrev)) * 100 : 0,
            foodcost_delta: fcPct - fcPctPrev,
        };

        // Sparkline data — fetch weekly for last 5 weeks
        const sparkWeeks: SparkPoint[] = [];
        for (let i = 4; i >= 0; i--) {
            const wTo = new Date(from.getTime() - i * 7 * 24 * 60 * 60 * 1000);
            const wFrom = new Date(wTo.getTime() - 6 * 24 * 60 * 60 * 1000);
            const wData = await posterRequest('dash.getProductsSales', {
                dateFrom: formatYYYYMMDD(wFrom),
                dateTo: formatYYYYMMDD(wTo),
            });
            const wProducts: PosterProduct[] = wData.response || [];
            let wRev = 0, wCost = 0, wMargin = 0;
            wProducts.forEach(p => {
                const r = toUAH(p.payed_sum);
                const m = toUAH(p.product_profit);
                wRev += r;
                wMargin += m;
                wCost += (r - m);
            });
            sparkWeeks.push({
                week: `${wFrom.getDate()} ${wFrom.toLocaleString('uk', { month: 'short' })}`,
                revenue: Math.round(wRev),
                cost: Math.round(wCost),
                margin: Math.round(wMargin),
                foodcost_pct: wRev > 0 ? parseFloat(((wCost / wRev) * 100).toFixed(1)) : 0,
            });
        }

        const recommendations = generateRecommendations(categories);
        const analysis = generateAnalysis(summary, categories);

        const periodLabel = {
            last_week: `${from.getDate()} ${from.toLocaleString('uk', { month: 'short' })}. – ${to.getDate()} ${to.toLocaleString('uk', { month: 'short' })}.`,
            last_2_weeks: `${from.getDate()} ${from.toLocaleString('uk', { month: 'short' })}. – ${to.getDate()} ${to.toLocaleString('uk', { month: 'short' })}.`,
            last_7: `Останні 7 днів`,
            last_14: `Останні 14 днів`,
            last_month: `${from.toLocaleString('uk', { month: 'long' })} ${from.getFullYear()}`,
        }[period] || '';

        return NextResponse.json({
            periodLabel,
            summary,
            categories,
            recommendations,
            analysis,
            sparkline: sparkWeeks,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        console.error('FoodCost API Error:', err);
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
