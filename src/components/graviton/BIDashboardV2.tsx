'use client';

import React, { useMemo, useEffect } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Factory, MapPinned, RefreshCw, Truck, WifiOff, ShieldAlert, Database } from 'lucide-react';
import { transformDeficitData } from '@/lib/transformers';
import { BI_Metrics, ProductionTask, SupabaseDeficitRow } from '@/types/bi';
import { cn } from '@/lib/utils';
import { authedFetcher } from '@/lib/authed-fetcher';
import { createClient } from '@/utils/supabase/client';

async function getAuthHeaders(): Promise<Record<string, string>> {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

const fetcher = authedFetcher;

type DynamicMetricState = {
    totalKg: number;
    criticalWeight: number;
    reserveWeight: number;
    criticalSKU: number;
    reserveSKU: number;
};

type PosterManufactureRow = {
    storage_id?: number;
    product_id?: number;
    product_name?: string;
    product_name_normalized?: string;
    quantity?: number;
};

type CategorySummary = {
    name: string;
    totalKg: number;
    itemsCount: number;
    criticalItems: number;
    topProducts: Array<{
        id: string;
        name: string;
        qty: number;
        stores: Array<{ id: string; name: string; qty: number; critical: boolean }>;
    }>;
    critical: boolean;
};

function aggregateProductionToday(rows: PosterManufactureRow[] = []) {
    const byProduct = new Map<string, number>();

    rows.forEach((row) => {
        const name = String(row.product_name || '').trim();
        const qty = Number(row.quantity || 0);
        if (!name || qty <= 0) return;
        byProduct.set(name, (byProduct.get(name) || 0) + qty);
    });

    const total = Array.from(byProduct.values()).reduce((sum, value) => sum + value, 0);
    return {
        total,
        items: Array.from(byProduct.entries())
            .map(([name, qty]) => ({
                name,
                qty,
                share: total > 0 ? (qty / total) * 100 : 0,
            }))
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 10),
    };
}

function buildCategorySummaries(queue: ProductionTask[]): CategorySummary[] {
    const grouped = new Map<string, CategorySummary>();

    queue.forEach((item) => {
        const categoryName = item.category || 'Інше';
        if (!grouped.has(categoryName)) {
            grouped.set(categoryName, {
                name: categoryName,
                totalKg: 0,
                itemsCount: 0,
                criticalItems: 0,
                topProducts: [],
                critical: false,
            });
        }

        const category = grouped.get(categoryName)!;
        const stores = item.stores
            .filter((store) => (store.deficitKg || 0) > 0 || (store.recommendedKg || 0) > 0)
            .map((store) => ({
                id: `${item.id}-${store.storeId}`,
                name: store.storeName,
                qty: store.deficitKg > 0 ? store.deficitKg : store.recommendedKg,
                critical: (store.deficitKg || 0) > 0,
            }))
            .sort((a, b) => b.qty - a.qty);

        const productQty = item.recommendedQtyKg || 0;
        category.totalKg += productQty;
        category.itemsCount += 1;
        if ((item.totalDeficitKg || 0) > 0) {
            category.criticalItems += 1;
            category.critical = true;
        }

        category.topProducts.push({
            id: item.id,
            name: item.name,
            qty: productQty,
            stores: stores.slice(0, 3),
        });
    });

    return Array.from(grouped.values())
        .map((category) => ({
            ...category,
            totalKg: Number(category.totalKg.toFixed(1)),
            topProducts: category.topProducts.sort((a, b) => b.qty - a.qty).slice(0, 3),
        }))
        .sort((a, b) => {
            if (a.critical !== b.critical) return a.critical ? -1 : 1;
            return b.totalKg - a.totalKg;
        });
}

export function BIDashboardV2() {
    const router = useRouter();
    const [dynamicMetrics, setDynamicMetrics] = React.useState<DynamicMetricState | null>(null);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [lastLiveSyncAt, setLastLiveSyncAt] = React.useState<string | null>(null);
    const [posterManufactures, setPosterManufactures] = React.useState<PosterManufactureRow[]>([]);
    const [productionSource, setProductionSource] = React.useState<'live' | 'cache' | 'empty' | null>(null);
    const [productionError, setProductionError] = React.useState<'auth' | 'sync' | null>(null);

    const { data: deficitData, mutate: mutateDeficit } = useSWR<SupabaseDeficitRow[]>('/api/graviton/deficit', fetcher, { refreshInterval: 60000 });
    const { data: metrics, mutate: mutateMetrics } = useSWR<BI_Metrics>('/api/graviton/metrics', fetcher, { refreshInterval: 60000 });

    // Bootstrap виробництво з кешу при відкритті сторінки
    useEffect(() => {
        let cancelled = false;
        async function loadCachedProduction() {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch('/api/graviton/production-daily', { headers });
                if (!res.ok) {
                    if (res.status === 401 || res.status === 403) {
                        if (!cancelled) setProductionError('auth');
                    } else {
                        if (!cancelled) setProductionError('sync');
                    }
                    return;
                }
                const json = await res.json();
                if (cancelled) return;
                const rows: PosterManufactureRow[] = (json.data ?? []).map((r: { storage_id?: number; product_name?: string; product_name_normalized?: string; quantity_kg?: number }) => ({
                    storage_id: r.storage_id,
                    product_name: r.product_name,
                    product_name_normalized: r.product_name_normalized,
                    quantity: r.quantity_kg,
                }));
                setPosterManufactures(rows);
                setLastLiveSyncAt(json.synced_at ?? null);
                setProductionSource(rows.length > 0 ? 'cache' : 'empty');
                setProductionError(null);
            } catch {
                if (!cancelled) setProductionError('sync');
            }
        }
        loadCachedProduction();
        return () => { cancelled = true; };
    }, []);

    const deficitQueue = useMemo(() => transformDeficitData(deficitData || []), [deficitData]);
    const productionToday = useMemo(() => aggregateProductionToday(posterManufactures), [posterManufactures]);
    const categorySummaries = useMemo(() => buildCategorySummaries(deficitQueue), [deficitQueue]);

    const topMetrics = useMemo(() => {
        const criticalSku = dynamicMetrics?.criticalSKU ?? metrics?.criticalSKU ?? 0;
        const totalNeed = dynamicMetrics?.totalKg ?? (metrics ? metrics.criticalWeight + metrics.highWeight + metrics.reserveWeight : 0);
        return {
            criticalSku,
            totalNeed,
            producedToday: productionToday.total,
        };
    }, [dynamicMetrics, metrics, productionToday.total]);

    const secondRowMetrics = useMemo(() => {
        const topCategory = categorySummaries[0];
        return {
            categories: categorySummaries.length,
            topCategory: topCategory?.name || '—',
            topCategoryKg: topCategory?.totalKg || 0,
        };
    }, [categorySummaries]);

    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            const headers = await getAuthHeaders();
            const response = await fetch('/api/graviton/sync-stocks', {
                method: 'POST',
                headers,
            });
            if (response.status === 401 || response.status === 403) {
                setProductionError('auth');
                return;
            }
            const text = await response.text();
            let result: any;
            try { result = JSON.parse(text); } catch { result = {}; }
            if (!response.ok || !result.success) {
                setProductionError('sync');
                throw new Error(result.error || `Sync failed: ${response.status}`);
            }

            const manufactures = Array.isArray(result.manufactures) ? result.manufactures : [];
            setLastLiveSyncAt(result.last_synced_at || result.timestamp || null);
            setPosterManufactures(manufactures);
            setProductionError(null);
            const apiSource = result.production_source as string | undefined;
            if (apiSource === 'live_edge' || apiSource === 'live_poster') {
                setProductionSource('live');
            } else if (apiSource === 'db_cache') {
                setProductionSource('cache');
            } else {
                setProductionSource('empty');
            }
            await Promise.all([mutateDeficit(), mutateMetrics()]);
        } catch (err) {
            if (productionError !== 'auth') setProductionError('sync');
            console.error('[BIDashboard] sync-stocks error:', err);
        } finally {
            setIsRefreshing(false);
        }
    };

    const signalText = topMetrics.criticalSku > 0
        ? `Критичний дефіцит: ${topMetrics.criticalSku} позицій. Починай з категорій з найбільшим дефіцитом та нульовим фактом.`
        : 'Критичних дефіцитів немає. Можна працювати з рекомендованим добором і плановим поповненням.';

    return (
        <div className="flex h-full flex-col gap-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                    <div className="max-w-2xl">
                        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                            <Factory size={12} />
                            Огляд мережі
                        </div>
                        <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Операційний огляд Graviton</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-600">Головний екран начальника виробництва: що зроблено сьогодні, що ще потрібно зробити і куди перейти далі.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className={cn(
                                'inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors',
                                isRefreshing ? 'bg-slate-200 text-slate-500' : 'bg-slate-900 text-white hover:bg-slate-800'
                            )}
                        >
                            <RefreshCw size={16} className={cn(isRefreshing && 'animate-spin')} />
                            Оновити залишки
                        </button>
                        <button
                            onClick={() => router.push('/graviton/distribution')}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                        >
                            <Truck size={16} />
                            До розподілу
                        </button>
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-700">Критично позицій</div>
                        <div className="mt-2 text-3xl font-bold text-red-700">{topMetrics.criticalSku}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Потрібно виготовити</div>
                        <div className="mt-2 text-3xl font-bold text-slate-900">{Math.round(topMetrics.totalNeed)} кг</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Вироблено сьогодні</div>
                        <div className="mt-2 text-3xl font-bold text-slate-900">{Math.round(topMetrics.producedToday)} кг</div>
                    </div>
                </div>

                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-slate-700">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-700" />
                        <div>
                            <div className="font-semibold text-red-700">Сигнал зміни</div>
                            <div className="mt-1">{signalText}</div>
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                    <button
                        onClick={() => router.push('/graviton/stores')}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                        <MapPinned size={16} />
                        До магазинів
                    </button>
                    <button
                        onClick={() => router.push('/graviton/analytics')}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                        <Factory size={16} />
                        До аналітики
                    </button>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Вироблено сьогодні</div>
                            <h3 className="mt-2 text-xl font-bold text-slate-900">Top 10 позицій за фактом</h3>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            {lastLiveSyncAt && (
                                <div className="text-xs text-slate-500">
                                    Оновлено: {new Date(lastLiveSyncAt).toLocaleTimeString('uk-UA')}
                                </div>
                            )}
                            {productionSource === 'live' && (
                                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    <span>Джерело: live</span>
                                </div>
                            )}
                            {productionSource === 'cache' && (
                                <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                    <Database size={10} />
                                    <span>Джерело: кеш</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {productionError === 'auth' && (
                        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            <ShieldAlert size={18} className="shrink-0" />
                            <span>Потрібна авторизація для завантаження виробництва. <a href="/login" className="underline font-semibold">Увійдіть</a>.</span>
                        </div>
                    )}

                    {productionError === 'sync' && (
                        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                            <WifiOff size={18} className="shrink-0" />
                            <span>Синк не вдався. Спробуйте натиснути «Оновити залишки».</span>
                        </div>
                    )}

                    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                        <table className="w-full border-collapse text-left">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Позиція</th>
                                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 text-right">Кг</th>
                                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 text-right">Частка</th>
                                </tr>
                            </thead>
                            <tbody>
                                {productionSource === null ? (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">Завантаження...</td>
                                    </tr>
                                ) : productionSource === 'empty' ? (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">Сьогодні виробництва немає.</td>
                                    </tr>
                                ) : productionToday.items.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">Після синхронізації тут з'явиться фактичний випуск за сьогодні.</td>
                                    </tr>
                                ) : productionToday.items.map((item) => (
                                    <tr key={item.name} className="border-t border-slate-100">
                                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.name}</td>
                                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-slate-900">{item.qty.toFixed(1)}</td>
                                        <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600">{item.share.toFixed(0)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Категорій у роботі</div>
                            <div className="mt-2 text-2xl font-bold text-slate-900">{secondRowMetrics.categories}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Головна категорія</div>
                            <div className="mt-2 text-base font-bold text-slate-900">{secondRowMetrics.topCategory}</div>
                            <div className="mt-1 text-sm text-slate-500">{secondRowMetrics.topCategoryKg.toFixed(0)} кг</div>
                        </div>
                    </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Що запускати зараз</div>
                            <h3 className="mt-2 text-xl font-bold text-slate-900">Категорії до відбору</h3>
                        </div>
                        <button
                            onClick={() => router.push('/graviton/analytics')}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                        >
                            До деталей
                        </button>
                    </div>

                    <div className="mt-5 space-y-4">
                        {categorySummaries.length === 0 ? (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-sm text-emerald-800">
                                Критичних категорій немає. Головний дефіцит по мережі зараз не вимагає термінового запуску.
                            </div>
                        ) : categorySummaries.map((category) => (
                            <div
                                key={category.name}
                                className={cn(
                                    'rounded-2xl border p-4',
                                    category.critical ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-slate-50'
                                )}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div
                                            className={cn(
                                                'inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                                                category.critical ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                                            )}
                                        >
                                            {category.critical ? 'Критично' : 'До перегляду'}
                                        </div>
                                        <div className="mt-3 text-lg font-bold text-slate-900">{category.name}</div>
                                        <div className="mt-1 text-sm text-slate-600">{category.itemsCount} позиції • {category.criticalItems} критичних</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">До заявки</div>
                                        <div className="mt-1 text-2xl font-bold text-slate-900">{category.totalKg.toFixed(0)} кг</div>
                                    </div>
                                </div>

                                <div className="mt-4 space-y-3">
                                    {category.topProducts.map((product) => (
                                        <div key={product.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-semibold text-slate-900">{product.name}</div>
                                                    <div className="mt-1 flex flex-wrap gap-2">
                                                        {product.stores.map((store) => (
                                                            <span
                                                                key={store.id}
                                                                className={cn(
                                                                    'rounded-full px-2.5 py-1 text-[11px] font-medium',
                                                                    store.critical ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                                                                )}
                                                            >
                                                                {store.name} {store.qty.toFixed(0)} кг
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-sm font-bold tabular-nums text-slate-900">{product.qty.toFixed(0)} кг</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
