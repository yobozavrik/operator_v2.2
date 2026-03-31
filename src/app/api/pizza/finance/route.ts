import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type RangePreset = '7' | '14' | '30' | 'custom';

type PosterSalesRow = {
    product_name?: string;
    product_id?: string | number;
    category_id?: string | number;
    count?: string | number;
    payed_sum?: string | number;
    product_profit?: string | number;
    spot_id?: string | number;
};

const POSTER_TOKEN = (process.env.POSTER_TOKEN || '').trim();
const POSTER_ACCOUNT = 'galia-baluvana34';
const PIZZA_CATEGORY_NAME = '\u041F\u0456\u0446\u0430';
const UNKNOWN_STORE = '\u0422\u043E\u0447\u043A\u0430';
const MONEY_DIVISOR = 100;

function toIsoDate(date: Date) {
    return date.toISOString().split('T')[0];
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function enumerateDays(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dates: string[] = [];
    const cursor = new Date(start);

    while (cursor <= end) {
        dates.push(toIsoDate(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }

    return dates;
}

function formatShortDate(isoDate: string) {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return isoDate;
    return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

function safeNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').trim();
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function safeMoney(value: unknown): number {
    return safeNumber(value) / MONEY_DIVISOR;
}

function stripStoreName(raw: string) {
    return raw
        .replace(/^\u041C\u0430\u0433\u0430\u0437\u0438\u043D\s+/u, '')
        .replace(/^\u0426\u0415\u0425\s+/u, '')
        .replace(/^\"|\"$/g, '')
        .trim();
}

async function posterRequest(method: string, params: Record<string, string> = {}) {
    if (!POSTER_TOKEN) {
        throw new Error('POSTER_TOKEN environment variable is missing');
    }

    const url = new URL(`https://${POSTER_ACCOUNT}.joinposter.com/api/${method}`);
    url.searchParams.set('token', POSTER_TOKEN);

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), { cache: 'no-store' });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error((payload as { error?: { message?: string } } | null)?.error?.message || `Poster API error: ${response.status}`);
    }

    if (payload && typeof payload === 'object' && 'error' in payload && (payload as { error?: unknown }).error) {
        const error = payload as { error?: { message?: string } };
        throw new Error(error.error?.message || 'Poster API returned an error');
    }

    return payload as { response?: unknown };
}

async function loadPizzaContext() {
    const [productsPayload, storagesPayload] = await Promise.all([
        posterRequest('menu.getProducts'),
        posterRequest('storage.getStorages'),
    ]);

    const products = Array.isArray(productsPayload.response) ? productsPayload.response as Array<Record<string, unknown>> : [];
    const storages = Array.isArray(storagesPayload.response) ? storagesPayload.response as Array<Record<string, unknown>> : [];

    const pizzaProducts = products.filter((product) => String(product.category_name || '') === PIZZA_CATEGORY_NAME);
    const pizzaProductIds = new Set(pizzaProducts.map((product) => Number(product.product_id)).filter((id) => Number.isFinite(id) && id > 0));
    const spotIds = new Set<number>();

    for (const product of pizzaProducts) {
        const spots = Array.isArray(product.spots) ? product.spots as Array<Record<string, unknown>> : [];
        for (const spot of spots) {
            if (String(spot.visible || '1') !== '1') continue;
            const spotId = Number(spot.spot_id);
            if (Number.isFinite(spotId) && spotId > 0) {
                spotIds.add(spotId);
            }
        }
    }

    const storeNameBySpotId = new Map<number, string>();
    for (const storage of storages) {
        const storageId = Number(storage.storage_id);
        const storageName = stripStoreName(String(storage.storage_name || ''));
        if (Number.isFinite(storageId) && storageId > 0 && storageName) {
            storeNameBySpotId.set(storageId, storageName);
        }
    }

    return {
        pizzaProductIds,
        spotIds: Array.from(spotIds).sort((a, b) => a - b),
        storeNameBySpotId,
    };
}

async function fetchProductSales(dateFrom: string, dateTo: string, spotId?: number) {
    const params: Record<string, string> = {
        date_from: dateFrom,
        date_to: dateTo,
    };

    if (spotId) {
        params.spot_id = String(spotId);
    }

    const payload = await posterRequest('dash.getProductsSales', params);
    return Array.isArray(payload.response) ? payload.response as PosterSalesRow[] : [];
}

function aggregatePizzaRows(rows: PosterSalesRow[], pizzaProductIds: Set<number>) {
    return rows.filter((row) => pizzaProductIds.has(Number(row.product_id)));
}

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const range = (searchParams.get('range') || '7') as RangePreset;
        const requestedEndDate = searchParams.get('endDate');
        const requestedStartDate = searchParams.get('startDate');

        let endDate = requestedEndDate || toIsoDate(new Date());
        let startDate = requestedStartDate || toIsoDate(new Date());

        if (range === '7') {
            startDate = toIsoDate(addDays(new Date(endDate), -6));
        } else if (range === '14') {
            startDate = toIsoDate(addDays(new Date(endDate), -13));
        } else if (range === '30') {
            startDate = toIsoDate(addDays(new Date(endDate), -29));
        } else {
            startDate = requestedStartDate || toIsoDate(addDays(new Date(endDate), -6));
            endDate = requestedEndDate || toIsoDate(new Date());
        }

        const currentDates = enumerateDays(startDate, endDate);
        const prevEnd = addDays(new Date(startDate), -1);
        const prevStart = addDays(prevEnd, -(currentDates.length - 1));
        const previousDates = enumerateDays(toIsoDate(prevStart), toIsoDate(prevEnd));

        const { pizzaProductIds, spotIds, storeNameBySpotId } = await loadPizzaContext();

        const [currentRowsRaw, previousRowsRaw, currentDailyRaw, previousDailyRaw, storesRaw] = await Promise.all([
            fetchProductSales(startDate, endDate),
            fetchProductSales(toIsoDate(prevStart), toIsoDate(prevEnd)),
            Promise.all(currentDates.map((date) => fetchProductSales(date, date))),
            Promise.all(previousDates.map((date) => fetchProductSales(date, date))),
            Promise.all(spotIds.map((spotId) => fetchProductSales(startDate, endDate, spotId))),
        ]);

        const currentRows = aggregatePizzaRows(currentRowsRaw, pizzaProductIds);
        const previousRows = aggregatePizzaRows(previousRowsRaw, pizzaProductIds);

        const currentDaily = currentDailyRaw.map((rows) => aggregatePizzaRows(rows, pizzaProductIds));
        const previousDaily = previousDailyRaw.map((rows) => aggregatePizzaRows(rows, pizzaProductIds));

        const currentKpi = { revenue: 0, profit: 0, qty: 0 };
        const previousKpi = { revenue: 0, profit: 0, qty: 0 };
        const productMap = new Map<string, { revenue: number; qty: number }>();

        for (const row of currentRows) {
            const productName = String(row.product_name || '').trim();
            const revenue = safeMoney(row.payed_sum);
            const profit = safeMoney(row.product_profit);
            const qty = safeNumber(row.count);

            currentKpi.revenue += revenue;
            currentKpi.profit += profit;
            currentKpi.qty += qty;

            if (productName) {
                const current = productMap.get(productName) || { revenue: 0, qty: 0 };
                current.revenue += revenue;
                current.qty += qty;
                productMap.set(productName, current);
            }
        }

        for (const row of previousRows) {
            previousKpi.revenue += safeMoney(row.payed_sum);
            previousKpi.profit += safeMoney(row.product_profit);
            previousKpi.qty += safeNumber(row.count);
        }

        const revenueTrendData = currentDates.map((date, index) => ({
            name: formatShortDate(date),
            current: currentDaily[index].reduce((sum, row) => sum + safeMoney(row.payed_sum), 0),
            previous: previousDaily[index].reduce((sum, row) => sum + safeMoney(row.payed_sum), 0),
        }));

        const qtyTrendData = currentDates.map((date, index) => ({
            name: formatShortDate(date),
            current: currentDaily[index].reduce((sum, row) => sum + safeNumber(row.count), 0),
            previous: previousDaily[index].reduce((sum, row) => sum + safeNumber(row.count), 0),
        }));

        const storesData = spotIds
            .map((spotId, index) => {
                const rows = aggregatePizzaRows(storesRaw[index], pizzaProductIds);
                const revenue = rows.reduce((sum, row) => sum + safeMoney(row.payed_sum), 0);
                const qty = rows.reduce((sum, row) => sum + safeNumber(row.count), 0);
                return {
                    name: storeNameBySpotId.get(spotId) || `${UNKNOWN_STORE} ${spotId}`,
                    revenue,
                    qty,
                };
            })
            .filter((row) => row.revenue > 0 || row.qty > 0)
            .sort((a, b) => b.revenue - a.revenue);

        const topProducts = Array.from(productMap.entries())
            .map(([name, values], index) => ({
                rank: index + 1,
                name,
                revenue: values.revenue,
                qty: values.qty,
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .map((row, index) => ({ ...row, rank: index + 1 }))
            .slice(0, 15);

        return NextResponse.json({
            period: {
                startDate,
                endDate,
                previousStartDate: toIsoDate(prevStart),
                previousEndDate: toIsoDate(prevEnd),
            },
            kpis: {
                current: {
                    revenue: currentKpi.revenue,
                    profit: currentKpi.profit,
                    margin_pct: currentKpi.revenue > 0 ? (currentKpi.profit / currentKpi.revenue) * 100 : 0,
                    qty: currentKpi.qty,
                },
                previous: {
                    revenue: previousKpi.revenue,
                    profit: previousKpi.profit,
                    margin_pct: previousKpi.revenue > 0 ? (previousKpi.profit / previousKpi.revenue) * 100 : 0,
                    qty: previousKpi.qty,
                },
            },
            revenueTrendData,
            qtyTrendData,
            storesData,
            topProducts,
        });
    } catch (error: any) {
        Logger.error('[pizza finance] error', { error: error?.message || String(error) });
        return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
    }
}
