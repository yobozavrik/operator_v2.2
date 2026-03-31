'use client';

import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
    AlertTriangle,
    BarChart3,
    ChefHat,
    Filter,
    Search,
    Store,
    TrendingUp,
    Warehouse,
} from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { authedFetcher } from '@/lib/authed-fetcher';

type AnalyticsResponse = {
    generatedAt: string;
    overview: {
        totalSkus: number;
        totalStores: number;
        totalStock: number;
        totalMinStock: number;
        totalNeed: number;
        totalBaked: number;
        fillIndex: number;
        zeroStockStores: number;
    };
    sku: Array<{
        productName: string;
        totalStock: number;
        minStock: number;
        avgSales: number;
        needNet: number;
        riskIndex: number;
        coverageDays: number | null;
        zeroStockStores: number;
        storesCovered: number;
        targetStock: number;
        productionGap: number;
    }>;
    stores: Array<{
        storeName: string;
        totalStock: number;
        minStock: number;
        needNet: number;
        avgSales: number;
        zeroStockSkus: number;
        fillRate: number;
    }>;
    storeSku: Array<{
        productName: string;
        storeName: string;
        stock: number;
        minStock: number;
        avgSales: number;
        needNet: number;
        fillRate: number;
        bakedAtFactory: number;
    }>;
    planVsFact: Array<{
        productName: string;
        bakedAtFactory: number;
        avgSales: number;
        targetStock: number;
        gapToTarget: number;
        productionGap: number;
        coverageDays: number | null;
    }>;
    signals: {
        topRisk: Array<{
            productName: string;
            riskIndex: number;
            needNet: number;
        }>;
        topNeed: Array<{
            productName: string;
            needNet: number;
            avgSales: number;
        }>;
        topOosStores: Array<{
            storeName: string;
            zeroStockSkus: number;
            needNet: number;
        }>;
    };
};

type FinanceResponse = {
    period: {
        startDate: string;
        endDate: string;
        previousStartDate: string;
        previousEndDate: string;
    };
    kpis: {
        current: {
            revenue: number;
            profit: number;
            margin_pct: number;
            qty: number;
        };
        previous: {
            revenue: number;
            profit: number;
            margin_pct: number;
            qty: number;
        };
    };
    revenueTrendData: Array<{
        name: string;
        current: number;
        previous: number;
    }>;
    qtyTrendData: Array<{
        name: string;
        current: number;
        previous: number;
    }>;
    storesData: Array<{
        name: string;
        revenue: number;
        qty: number;
    }>;
    topProducts: Array<{
        rank: number;
        name: string;
        revenue: number;
        qty: number;
    }>;
};

type AggregatedSkuRow = {
    productName: string;
    totalStock: number;
    minStock: number;
    avgSales: number;
    needNet: number;
    riskIndex: number;
    coverageDays: number | null;
    zeroStockStores: number;
    storesCovered: number;
    targetStock: number;
    productionGap: number;
    bakedAtFactory: number;
};

type ViewMode = 'sku' | 'trends' | 'stores';
type SortMode = 'need' | 'sales' | 'risk' | 'coverage';
type RangePreset = '7' | '14' | '30' | 'custom';

const fetcher = authedFetcher;

function formatNumber(value: number, digits = 0) {
    return new Intl.NumberFormat('uk-UA', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(value);
}

function formatCoverage(value: number | null) {
    if (value === null || !Number.isFinite(value)) return '—';
    return `${formatNumber(value, 1)} дн`;
}

function getCoverageTone(value: number | null) {
    if (value === null) return 'text-text-secondary';
    if (value < 1) return 'text-rose-500';
    if (value < 2.5) return 'text-amber-500';
    return 'text-emerald-600';
}

function getRiskTone(value: number) {
    if (value >= 1500) return 'text-rose-500';
    if (value >= 800) return 'text-amber-500';
    return 'text-text-primary';
}

function KpiCard({
    title,
    value,
    note,
    tone = 'text-text-primary',
}: {
    title: string;
    value: string;
    note: string;
    tone?: string;
}) {
    return (
        <div className="rounded-3xl border border-panel-border bg-panel-bg p-5 shadow-[var(--panel-shadow)]">
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-text-secondary">{title}</div>
            <div className={`mt-3 text-4xl font-black ${tone}`}>{value}</div>
            <div className="mt-2 text-sm text-text-secondary">{note}</div>
        </div>
    );
}

function ViewButton({
    active,
    label,
    onClick,
}: {
    active: boolean;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={
                active
                    ? 'rounded-xl border border-accent-primary/30 bg-accent-primary/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-accent-primary'
                    : 'rounded-xl border border-panel-border bg-bg-primary px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-text-secondary hover:text-text-primary'
            }
        >
            {label}
        </button>
    );
}

function sortSkuRows(rows: AggregatedSkuRow[], sortMode: SortMode) {
    return [...rows].sort((a, b) => {
        if (sortMode === 'sales') return b.avgSales - a.avgSales;
        if (sortMode === 'risk') return b.riskIndex - a.riskIndex;
        if (sortMode === 'coverage') {
            return (a.coverageDays ?? Number.POSITIVE_INFINITY) - (b.coverageDays ?? Number.POSITIVE_INFINITY);
        }
        return b.needNet - a.needNet;
    });
}

export function PizzaSalesAnalytics() {
    const today = new Date().toISOString().split('T')[0];
    const [rangePreset, setRangePreset] = useState<RangePreset>('7');
    const [customStartDate, setCustomStartDate] = useState(today);
    const [customEndDate, setCustomEndDate] = useState(today);

    const { data, error, isLoading } = useSWR<AnalyticsResponse>('/api/pizza/analytics/dashboard', fetcher, {
        refreshInterval: 60000,
    });

    const financeUrl = useMemo(() => {
        const params = new URLSearchParams();
        params.set('range', rangePreset);
        if (rangePreset === 'custom') {
            params.set('startDate', customStartDate);
            params.set('endDate', customEndDate);
        }
        return `/api/pizza/finance?${params.toString()}`;
    }, [rangePreset, customEndDate, customStartDate]);

    const { data: financeData, error: financeError, isLoading: financeLoading } = useSWR<FinanceResponse>(financeUrl, fetcher, {
        refreshInterval: 60000,
    });

    const [viewMode, setViewMode] = useState<ViewMode>('sku');
    const [sortMode, setSortMode] = useState<SortMode>('need');
    const [search, setSearch] = useState('');
    const [selectedStore, setSelectedStore] = useState('all');
    const [selectedSku, setSelectedSku] = useState<string | null>(null);

    const storeOptions = useMemo(() => {
        if (!data) return [] as string[];
        return ['all', ...data.stores.map((item) => item.storeName)];
    }, [data]);

    const aggregatedSku = useMemo(() => {
        if (!data) return [] as AggregatedSkuRow[];

        if (selectedStore === 'all') {
            return data.sku.map((item) => ({
                ...item,
                bakedAtFactory: 0,
            }));
        }

        const byStore = data.storeSku
            .filter((item) => item.storeName === selectedStore)
            .reduce<Map<string, AggregatedSkuRow>>((acc, item) => {
                const current = acc.get(item.productName) || {
                    productName: item.productName,
                    totalStock: 0,
                    minStock: 0,
                    avgSales: 0,
                    needNet: 0,
                    riskIndex: 0,
                    coverageDays: null,
                    zeroStockStores: 0,
                    storesCovered: 0,
                    targetStock: 0,
                    productionGap: 0,
                    bakedAtFactory: 0,
                };

                current.totalStock += item.stock;
                current.minStock += item.minStock;
                current.avgSales += item.avgSales;
                current.needNet += item.needNet;
                current.bakedAtFactory += item.bakedAtFactory;
                current.zeroStockStores += item.stock <= 0 ? 1 : 0;
                current.storesCovered += 1;
                acc.set(item.productName, current);
                return acc;
            }, new Map());

        return Array.from(byStore.values()).map((item) => {
            const targetStock = Math.max(item.minStock, item.avgSales * 3);
            const productionGap = Math.max(0, targetStock - item.totalStock - item.bakedAtFactory);
            const coverageDays = item.avgSales > 0 ? item.totalStock / item.avgSales : null;
            const riskIndex = item.minStock > 0
                ? Math.round(item.avgSales * (item.needNet / item.minStock) * 100)
                : 0;

            return {
                ...item,
                targetStock,
                productionGap,
                coverageDays,
                riskIndex,
            };
        });
    }, [data, selectedStore]);

    const filteredSku = useMemo(() => {
        const query = search.trim().toLowerCase();
        const searched = query
            ? aggregatedSku.filter((item) => item.productName.toLowerCase().includes(query))
            : aggregatedSku;

        return sortSkuRows(searched, sortMode);
    }, [aggregatedSku, search, sortMode]);

    const filteredStores = useMemo(() => {
        if (!data) return [];

        const query = search.trim().toLowerCase();
        const baseRows = selectedStore === 'all'
            ? data.stores
            : data.stores.filter((item) => item.storeName === selectedStore);

        const searched = query
            ? baseRows.filter((item) => item.storeName.toLowerCase().includes(query))
            : baseRows;

        return [...searched].sort((a, b) => {
            if (sortMode === 'sales') return b.avgSales - a.avgSales;
            if (sortMode === 'coverage') return a.fillRate - b.fillRate;
            return b.needNet - a.needNet;
        });
    }, [data, search, selectedStore, sortMode]);

    const trendRows = useMemo(() => {
        return [...filteredSku]
            .map((item) => ({
                ...item,
                signal:
                    item.coverageDays !== null && item.coverageDays < 1
                        ? 'Критично'
                        : item.riskIndex >= 1500
                            ? 'Ризик'
                            : item.needNet > 0
                                ? 'Контроль'
                                : 'Стабільно',
            }))
            .sort((a, b) => b.riskIndex - a.riskIndex || b.needNet - a.needNet);
    }, [filteredSku]);

    useEffect(() => {
        if (!filteredSku.length) {
            setSelectedSku(null);
            return;
        }

        if (!selectedSku || !filteredSku.some((item) => item.productName === selectedSku)) {
            setSelectedSku(filteredSku[0].productName);
        }
    }, [filteredSku, selectedSku]);

    const selectedSkuDetail = useMemo(() => {
        if (!data || !selectedSku) return null;

        const summary = filteredSku.find((item) => item.productName === selectedSku)
            || aggregatedSku.find((item) => item.productName === selectedSku)
            || null;

        const storeRows = data.storeSku
            .filter((item) => item.productName === selectedSku)
            .filter((item) => selectedStore === 'all' || item.storeName === selectedStore)
            .sort((a, b) => b.needNet - a.needNet || a.fillRate - b.fillRate);

        const biggestNeedStore = storeRows[0] || null;
        const avgFillRate = storeRows.length
            ? storeRows.reduce((sum, row) => sum + row.fillRate, 0) / storeRows.length
            : 0;

        return {
            summary,
            storeRows,
            biggestNeedStore,
            avgFillRate,
            planGap: data.planVsFact.find((item) => item.productName === selectedSku) || null,
        };
    }, [aggregatedSku, data, filteredSku, selectedSku, selectedStore]);

    const visibleSkuRows = viewMode === 'trends' ? trendRows : filteredSku;
    const filteredSales = filteredSku.reduce((sum, item) => sum + item.avgSales, 0);
    const filteredNeed = filteredSku.reduce((sum, item) => sum + item.needNet, 0);
    const filteredStock = filteredSku.reduce((sum, item) => sum + item.totalStock, 0);
    const criticalSkuCount = trendRows.filter((item) => item.coverageDays !== null && item.coverageDays < 1).length;
    const revenueDelta = financeData?.kpis.previous.revenue && financeData.kpis.previous.revenue > 0
        ? ((financeData.kpis.current.revenue - financeData.kpis.previous.revenue) / financeData.kpis.previous.revenue) * 100
        : 0;
    const qtyDelta = financeData?.kpis.previous.qty && financeData.kpis.previous.qty > 0
        ? ((financeData.kpis.current.qty - financeData.kpis.previous.qty) / financeData.kpis.previous.qty) * 100
        : 0;
    const topRevenueStores = financeData?.storesData.slice(0, 10) || [];
    const topRevenueProducts = financeData?.topProducts.slice(0, 10) || [];
    const currentPeriodDays = financeData ? financeData.revenueTrendData.length || 1 : 1;
    const previousPeriodDays = financeData ? financeData.revenueTrendData.length || 1 : 1;
    const currentMarginPerDay = financeData ? financeData.kpis.current.margin_pct / currentPeriodDays : 0;
    const previousMarginPerDay = financeData ? financeData.kpis.previous.margin_pct / previousPeriodDays : 0;
    const currentQtyPerDay = financeData ? financeData.kpis.current.qty / currentPeriodDays : 0;
    const previousQtyPerDay = financeData ? financeData.kpis.previous.qty / previousPeriodDays : 0;
    const qtyPerDayDelta = previousQtyPerDay > 0
        ? ((currentQtyPerDay - previousQtyPerDay) / previousQtyPerDay) * 100
        : 0;
    const marginPerDayDelta = previousMarginPerDay > 0
        ? ((currentMarginPerDay - previousMarginPerDay) / previousMarginPerDay) * 100
        : 0;

    if (error || financeError) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center rounded-3xl border border-red-500/20 bg-red-500/5 text-red-400">
                <div className="flex flex-col items-center gap-3">
                    <AlertTriangle size={32} />
                    <span className="text-sm font-bold uppercase tracking-[0.25em]">Помилка завантаження аналітики піци</span>
                </div>
            </div>
        );
    }

    if (isLoading || financeLoading || !data || !financeData) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center rounded-3xl border border-panel-border bg-panel-bg">
                <div className="flex flex-col items-center gap-4 text-text-secondary">
                    <ChefHat size={40} className="animate-pulse text-accent-primary" />
                    <span className="text-sm font-bold uppercase tracking-[0.25em]">Завантаження аналітики піци</span>
                </div>
            </div>
        );
    }

    const finance = financeData;

    return (
        <div className="space-y-6">
            <section className="rounded-3xl border border-panel-border bg-panel-bg p-6 shadow-[var(--panel-shadow)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-text-secondary">Аналітика піци</p>
                        <h1 className="mt-2 font-[family-name:var(--font-chakra)] text-3xl font-black uppercase tracking-[0.12em] text-text-primary">
                            Продажі, тренди, магазини
                        </h1>
                        <p className="mt-3 max-w-3xl text-sm text-text-secondary">
                            Окремий ERP-екран для читання попиту: знайти SKU, звузити до магазину, порівняти рядки
                            та перейти в деталь без змішування з операційним плануванням.
                        </p>
                    </div>
                    <div className="text-xs font-[family-name:var(--font-jetbrains)] uppercase tracking-[0.2em] text-text-secondary">
                        Оновлено: {new Date(data.generatedAt).toLocaleString('uk-UA')}
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    title="Виручка"
                    value={`${formatNumber(financeData.kpis.current.revenue, 0)} ₴`}
                    note={`Попередній період: ${revenueDelta >= 0 ? '+' : ''}${formatNumber(revenueDelta, 1)}%`}
                    tone="text-accent-primary"
                />
                <KpiCard
                    title="Продано, шт"
                    value={formatNumber(financeData.kpis.current.qty, 0)}
                    note={`Попередній період: ${qtyDelta >= 0 ? '+' : ''}${formatNumber(qtyDelta, 1)}%`}
                    tone="text-emerald-600"
                />
                <KpiCard
                    title="Середні продажі / день"
                    value={`${formatNumber(currentQtyPerDay, 1)} шт`}
                    note={`було ${formatNumber(previousQtyPerDay, 1)} | ${qtyPerDayDelta >= 0 ? "+" : ""}${formatNumber(qtyPerDayDelta, 1)}%`}
                    tone="text-text-primary"
                />
                <KpiCard
                    title="Період"
                    value={`${financeData.period.startDate.slice(5)} → ${financeData.period.endDate.slice(5)}`}
                    note="Поточний аналітичний інтервал"
                />
            </section>

            <section className="rounded-3xl border border-panel-border bg-panel-bg p-5 shadow-[var(--panel-shadow)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-text-secondary">Період продажів</div>
                        <div className="mt-2 text-sm text-text-secondary">Аналітика виручки, кількості, магазинів і трендів.</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(['7', '14', '30', 'custom'] as RangePreset[]).map((preset) => (
                            <button
                                key={preset}
                                onClick={() => setRangePreset(preset)}
                                className={
                                    rangePreset === preset
                                        ? 'rounded-xl border border-accent-primary/30 bg-accent-primary/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-accent-primary'
                                        : 'rounded-xl border border-panel-border bg-bg-primary px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-text-secondary hover:text-text-primary'
                                }
                            >
                                {preset === 'custom' ? 'custom' : `${preset} днів`}
                            </button>
                        ))}
                    </div>
                </div>

                {rangePreset === 'custom' ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <label className="rounded-2xl border border-panel-border bg-bg-primary px-4 py-3 text-sm text-text-primary">
                            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">Початок</div>
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(event) => setCustomStartDate(event.target.value)}
                                className="w-full bg-transparent outline-none"
                            />
                        </label>
                        <label className="rounded-2xl border border-panel-border bg-bg-primary px-4 py-3 text-sm text-text-primary">
                            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">Кінець</div>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(event) => setCustomEndDate(event.target.value)}
                                className="w-full bg-transparent outline-none"
                            />
                        </label>
                    </div>
                ) : null}
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <div className="rounded-3xl border border-panel-border bg-panel-bg p-5 shadow-[var(--panel-shadow)]">
                    <div className="mb-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-text-secondary">Продажі, шт</div>
                        <h2 className="mt-2 font-[family-name:var(--font-chakra)] text-lg font-black uppercase tracking-[0.12em] text-text-primary">
                            Поточні дні vs попередні
                        </h2>
                    </div>
                    <div className="h-72 min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={financeData.qtyTrendData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                                <XAxis dataKey="name" stroke="currentColor" tick={{ fill: 'currentColor', fontSize: 12 }} />
                                <YAxis stroke="currentColor" tick={{ fill: 'currentColor', fontSize: 12 }} />
                                <Tooltip formatter={(value: number | string | undefined) => `${formatNumber(Number(value) || 0, 0)} шт`} />
                                <Line type="monotone" dataKey="current" stroke="#2563eb" strokeWidth={3} dot={false} name="Поточний період" />
                                <Line type="monotone" dataKey="previous" stroke="#94a3b8" strokeWidth={2} dot={false} name="Попередній період" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="rounded-3xl border border-panel-border bg-panel-bg p-5 shadow-[var(--panel-shadow)]">
                    <div className="mb-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-text-secondary">Топ піц по виручці</div>
                        <h2 className="mt-2 font-[family-name:var(--font-chakra)] text-lg font-black uppercase tracking-[0.12em] text-text-primary">
                            Продажі в грн
                        </h2>
                    </div>
                    <div className="h-72 min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[...topRevenueProducts].reverse()} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                                <XAxis type="number" stroke="currentColor" tick={{ fill: 'currentColor', fontSize: 12 }} />
                                <YAxis dataKey="name" type="category" width={120} stroke="currentColor" tick={{ fill: 'currentColor', fontSize: 11 }} />
                                <Tooltip formatter={(value: number | string | undefined) => `${formatNumber(Number(value) || 0, 0)} ₴`} />
                                <Bar dataKey="revenue" fill="#0f766e" radius={[0, 6, 6, 0]} name="Виручка" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-3xl border border-panel-border bg-panel-bg p-5 shadow-[var(--panel-shadow)]">
                    <div className="mb-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-text-secondary">Магазини</div>
                        <h2 className="mt-2 font-[family-name:var(--font-chakra)] text-lg font-black uppercase tracking-[0.12em] text-text-primary">
                            Порівняння по виручці
                        </h2>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-panel-border">
                        <table className="w-full text-sm">
                            <thead className="bg-bg-primary/20 text-[11px] uppercase tracking-[0.2em] text-text-secondary">
                                <tr>
                                    <th className="px-4 py-3 text-left">Магазин</th>
                                    <th className="px-4 py-3 text-right">Виручка</th>
                                    <th className="px-4 py-3 text-right">Продано, шт</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topRevenueStores.map((row) => (
                                    <tr key={row.name} className="border-t border-panel-border">
                                        <td className="px-4 py-3 font-semibold text-text-primary">{row.name}</td>
                                        <td className="px-4 py-3 text-right font-bold text-accent-primary">{formatNumber(row.revenue, 0)} ₴</td>
                                        <td className="px-4 py-3 text-right text-text-secondary">{formatNumber(row.qty, 0)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="rounded-3xl border border-panel-border bg-panel-bg p-5 shadow-[var(--panel-shadow)]">
                    <div className="mb-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-text-secondary">Піци</div>
                        <h2 className="mt-2 font-[family-name:var(--font-chakra)] text-lg font-black uppercase tracking-[0.12em] text-text-primary">
                            Продажі по SKU в грн
                        </h2>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-panel-border">
                        <table className="w-full text-sm">
                            <thead className="bg-bg-primary/20 text-[11px] uppercase tracking-[0.2em] text-text-secondary">
                                <tr>
                                    <th className="px-4 py-3 text-left">Піца</th>
                                    <th className="px-4 py-3 text-right">Виручка</th>
                                    <th className="px-4 py-3 text-right">Продано, шт</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topRevenueProducts.map((row) => (
                                    <tr key={row.name} className="border-t border-panel-border">
                                        <td className="px-4 py-3 font-semibold text-text-primary">{row.name}</td>
                                        <td className="px-4 py-3 text-right font-bold text-accent-primary">{formatNumber(row.revenue, 0)} ₴</td>
                                        <td className="px-4 py-3 text-right text-text-secondary">{formatNumber(row.qty, 0)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    title="Продаж / день"
                    value={formatNumber(filteredSales, 1)}
                    note={selectedStore === 'all' ? 'Сумарний середній продаж по мережі' : `Середній продаж: ${selectedStore}`}
                    tone="text-accent-primary"
                />
                <KpiCard
                    title="Потреба"
                    value={formatNumber(filteredNeed)}
                    note="Чистий дефіцит у поточному фільтрі"
                    tone="text-amber-500"
                />
                <KpiCard
                    title="Запас"
                    value={formatNumber(filteredStock)}
                    note="Поточний симульований/живий запас у вибірці"
                />
                <KpiCard
                    title="Критичні SKU"
                    value={formatNumber(criticalSkuCount)}
                    note="Покриття менше одного дня"
                    tone={criticalSkuCount > 0 ? 'text-rose-500' : 'text-emerald-600'}
                />
            </section>

            <section className="rounded-3xl border border-panel-border bg-panel-bg p-5 shadow-[var(--panel-shadow)]">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.25em] text-text-secondary">
                        <Filter size={14} className="text-accent-primary" />
                        Панель керування
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <ViewButton active={viewMode === 'sku'} label="Піци" onClick={() => setViewMode('sku')} />
                        <ViewButton active={viewMode === 'trends'} label="Тренди" onClick={() => setViewMode('trends')} />
                        <ViewButton active={viewMode === 'stores'} label="Магазини" onClick={() => setViewMode('stores')} />
                    </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_240px_240px]">
                    <label className="flex items-center gap-3 rounded-2xl border border-panel-border bg-bg-primary px-4 py-3">
                        <Search size={16} className="text-text-secondary" />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={viewMode === 'stores' ? 'Пошук магазину' : 'Пошук піци'}
                            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary"
                        />
                    </label>

                    <select
                        value={selectedStore}
                        onChange={(event) => setSelectedStore(event.target.value)}
                        className="rounded-2xl border border-panel-border bg-bg-primary px-4 py-3 text-sm text-text-primary outline-none"
                    >
                        {storeOptions.map((storeName) => (
                            <option key={storeName} value={storeName}>
                                {storeName === 'all' ? 'Всі магазини' : storeName}
                            </option>
                        ))}
                    </select>

                    <select
                        value={sortMode}
                        onChange={(event) => setSortMode(event.target.value as SortMode)}
                        className="rounded-2xl border border-panel-border bg-bg-primary px-4 py-3 text-sm text-text-primary outline-none"
                    >
                        <option value="need">Сортування: потреба</option>
                        <option value="sales">Сортування: продаж</option>
                        <option value="risk">Сортування: ризик</option>
                        <option value="coverage">Сортування: покриття</option>
                    </select>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.9fr)]">
                <section className="overflow-hidden rounded-3xl border border-panel-border bg-panel-bg shadow-[var(--panel-shadow)]">
                    <div className="flex items-center gap-3 border-b border-panel-border bg-bg-primary/40 px-5 py-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
                            {viewMode === 'stores' ? <Store size={18} /> : viewMode === 'trends' ? <TrendingUp size={18} /> : <BarChart3 size={18} />}
                        </div>
                        <div>
                            <h2 className="font-[family-name:var(--font-chakra)] text-sm font-black uppercase tracking-[0.2em] text-text-primary md:text-base">
                                {viewMode === 'stores' ? 'Магазини' : viewMode === 'trends' ? 'Тренди та сигнали' : 'SKU по продажах'}
                            </h2>
                            <p className="mt-1 text-xs text-text-secondary">
                                {viewMode === 'stores'
                                    ? 'Порівняння точок по дефіциту, продажу і заповненню.'
                                    : viewMode === 'trends'
                                        ? 'Швидкий список позицій, які вимагають уваги.'
                                        : 'Основна робоча таблиця для порівняння попиту і запасу.'}
                            </p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        {viewMode === 'stores' ? (
                            <table className="w-full text-sm">
                                <thead className="bg-bg-primary/20 text-[11px] uppercase tracking-[0.2em] text-text-secondary">
                                    <tr>
                                        <th className="px-5 py-3 text-left">Магазин</th>
                                        <th className="px-5 py-3 text-right">Продаж / день</th>
                                        <th className="px-5 py-3 text-right">Запас</th>
                                        <th className="px-5 py-3 text-right">Потреба</th>
                                        <th className="px-5 py-3 text-right">Заповнення</th>
                                        <th className="px-5 py-3 text-right">OOS SKU</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredStores.map((item) => (
                                        <tr key={item.storeName} className="border-t border-panel-border">
                                            <td className="px-5 py-3 font-semibold text-text-primary">{item.storeName}</td>
                                            <td className="px-5 py-3 text-right font-bold text-accent-primary">{formatNumber(item.avgSales, 1)}</td>
                                            <td className="px-5 py-3 text-right text-text-secondary">{formatNumber(item.totalStock)}</td>
                                            <td className="px-5 py-3 text-right font-bold text-amber-500">{formatNumber(item.needNet)}</td>
                                            <td className={`px-5 py-3 text-right font-bold ${item.fillRate < 100 ? 'text-rose-500' : 'text-emerald-600'}`}>
                                                {formatNumber(item.fillRate, 0)}%
                                            </td>
                                            <td className="px-5 py-3 text-right font-bold text-rose-500">{formatNumber(item.zeroStockSkus)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="bg-bg-primary/20 text-[11px] uppercase tracking-[0.2em] text-text-secondary">
                                    <tr>
                                        <th className="px-5 py-3 text-left">Піца</th>
                                        <th className="px-5 py-3 text-right">Продаж</th>
                                        <th className="px-5 py-3 text-right">Запас</th>
                                        <th className="px-5 py-3 text-right">Потреба</th>
                                        <th className="px-5 py-3 text-right">Покриття</th>
                                        <th className="px-5 py-3 text-right">Ризик</th>
                                        {viewMode === 'trends' ? <th className="px-5 py-3 text-right">Сигнал</th> : null}
                                    </tr>
                                </thead>
                                <tbody>
                                    {viewMode === 'trends'
                                        ? trendRows.map((item) => (
                                            <tr
                                                key={item.productName}
                                                onClick={() => setSelectedSku(item.productName)}
                                                className={
                                                    selectedSku === item.productName
                                                        ? 'cursor-pointer border-t border-panel-border bg-accent-primary/5'
                                                        : 'cursor-pointer border-t border-panel-border hover:bg-bg-primary/40'
                                                }
                                            >
                                                <td className="px-5 py-3 font-semibold text-text-primary">{item.productName}</td>
                                                <td className="px-5 py-3 text-right font-bold text-accent-primary">{formatNumber(item.avgSales, 1)}</td>
                                                <td className="px-5 py-3 text-right text-text-secondary">{formatNumber(item.totalStock)}</td>
                                                <td className="px-5 py-3 text-right font-bold text-amber-500">{formatNumber(item.needNet)}</td>
                                                <td className={`px-5 py-3 text-right font-bold ${getCoverageTone(item.coverageDays)}`}>
                                                    {formatCoverage(item.coverageDays)}
                                                </td>
                                                <td className={`px-5 py-3 text-right font-bold ${getRiskTone(item.riskIndex)}`}>
                                                    {formatNumber(item.riskIndex)}
                                                </td>
                                                <td className="px-5 py-3 text-right font-bold text-text-secondary">{item.signal}</td>
                                            </tr>
                                        ))
                                        : filteredSku.map((item) => (
                                            <tr
                                                key={item.productName}
                                                onClick={() => setSelectedSku(item.productName)}
                                                className={
                                                    selectedSku === item.productName
                                                        ? 'cursor-pointer border-t border-panel-border bg-accent-primary/5'
                                                        : 'cursor-pointer border-t border-panel-border hover:bg-bg-primary/40'
                                                }
                                            >
                                                <td className="px-5 py-3 font-semibold text-text-primary">{item.productName}</td>
                                                <td className="px-5 py-3 text-right font-bold text-accent-primary">{formatNumber(item.avgSales, 1)}</td>
                                                <td className="px-5 py-3 text-right text-text-secondary">{formatNumber(item.totalStock)}</td>
                                                <td className="px-5 py-3 text-right font-bold text-amber-500">{formatNumber(item.needNet)}</td>
                                                <td className={`px-5 py-3 text-right font-bold ${getCoverageTone(item.coverageDays)}`}>
                                                    {formatCoverage(item.coverageDays)}
                                                </td>
                                                <td className={`px-5 py-3 text-right font-bold ${getRiskTone(item.riskIndex)}`}>
                                                    {formatNumber(item.riskIndex)}
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>

                <aside className="overflow-hidden rounded-3xl border border-panel-border bg-panel-bg shadow-[var(--panel-shadow)]">
                    <div className="flex items-center gap-3 border-b border-panel-border bg-bg-primary/40 px-5 py-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
                            <Warehouse size={18} />
                        </div>
                        <div>
                            <h2 className="font-[family-name:var(--font-chakra)] text-sm font-black uppercase tracking-[0.2em] text-text-primary md:text-base">
                                Деталь SKU
                            </h2>
                            <p className="mt-1 text-xs text-text-secondary">Одна позиція без втрати контексту таблиці.</p>
                        </div>
                    </div>

                    {selectedSkuDetail?.summary ? (
                        <div className="space-y-5 p-5">
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">Позиція</div>
                                <div className="mt-2 text-xl font-black leading-tight text-text-primary">
                                    {selectedSkuDetail.summary.productName}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-2xl border border-panel-border bg-bg-primary/50 p-3">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">Продаж / день</div>
                                    <div className="mt-2 text-2xl font-black text-accent-primary">
                                        {formatNumber(selectedSkuDetail.summary.avgSales, 1)}
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-panel-border bg-bg-primary/50 p-3">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">Потреба</div>
                                    <div className="mt-2 text-2xl font-black text-amber-500">
                                        {formatNumber(selectedSkuDetail.summary.needNet)}
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-panel-border bg-bg-primary/50 p-3">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">Покриття</div>
                                    <div className={`mt-2 text-2xl font-black ${getCoverageTone(selectedSkuDetail.summary.coverageDays)}`}>
                                        {formatCoverage(selectedSkuDetail.summary.coverageDays)}
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-panel-border bg-bg-primary/50 p-3">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">Ризик</div>
                                    <div className={`mt-2 text-2xl font-black ${getRiskTone(selectedSkuDetail.summary.riskIndex)}`}>
                                        {formatNumber(selectedSkuDetail.summary.riskIndex)}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 rounded-2xl border border-panel-border bg-bg-primary/40 p-4">
                                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-text-secondary">
                                    <span>Ключові сигнали</span>
                                    <span>{selectedSkuDetail.storeRows.length} магазинів</span>
                                </div>
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-text-secondary">Найбільша потреба</span>
                                        <span className="font-semibold text-text-primary">
                                            {selectedSkuDetail.biggestNeedStore
                                                ? `${selectedSkuDetail.biggestNeedStore.storeName} (${formatNumber(selectedSkuDetail.biggestNeedStore.needNet)})`
                                                : '—'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-text-secondary">Середнє заповнення по SKU</span>
                                        <span className={`font-semibold ${selectedSkuDetail.avgFillRate < 100 ? 'text-rose-500' : 'text-emerald-600'}`}>
                                            {formatNumber(selectedSkuDetail.avgFillRate, 0)}%
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-text-secondary">Розрив виробництва</span>
                                        <span className="font-semibold text-text-primary">
                                            {formatNumber(selectedSkuDetail.planGap?.productionGap || selectedSkuDetail.summary.productionGap)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="mb-3 flex items-center justify-between">
                                    <div className="text-xs font-bold uppercase tracking-[0.2em] text-text-secondary">Рядки по магазинах</div>
                                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">
                                        {selectedStore === 'all' ? 'мережа' : selectedStore}
                                    </div>
                                </div>
                                <div className="overflow-hidden rounded-2xl border border-panel-border">
                                    <table className="w-full text-sm">
                                        <thead className="bg-bg-primary/30 text-[10px] uppercase tracking-[0.2em] text-text-secondary">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Точка</th>
                                                <th className="px-3 py-2 text-right">Запас</th>
                                                <th className="px-3 py-2 text-right">Потр.</th>
                                                <th className="px-3 py-2 text-right">Заповнення</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedSkuDetail.storeRows.map((row) => (
                                                <tr key={`${row.productName}-${row.storeName}`} className="border-t border-panel-border">
                                                    <td className="px-3 py-2 font-medium text-text-primary">{row.storeName}</td>
                                                    <td className="px-3 py-2 text-right text-text-secondary">{formatNumber(row.stock)}</td>
                                                    <td className="px-3 py-2 text-right font-bold text-amber-500">{formatNumber(row.needNet)}</td>
                                                    <td className={`px-3 py-2 text-right font-bold ${row.fillRate < 100 ? 'text-rose-500' : 'text-emerald-600'}`}>
                                                        {formatNumber(row.fillRate, 0)}%
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-6 text-sm text-text-secondary">Оберіть піцу в таблиці, щоб побачити деталь по магазинах.</div>
                    )}
                </aside>
            </div>

            <section className="grid gap-6 xl:grid-cols-3">
                <div className="rounded-3xl border border-panel-border bg-panel-bg p-5 shadow-[var(--panel-shadow)]">
                    <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-text-secondary">Топ ризику</div>
                    <div className="mt-4 space-y-3">
                        {data.signals.topRisk.map((item) => (
                            <button
                                key={item.productName}
                                onClick={() => {
                                    setViewMode('trends');
                                    setSelectedSku(item.productName);
                                }}
                                className="flex w-full items-center justify-between rounded-2xl border border-panel-border bg-bg-primary/40 px-4 py-3 text-left hover:bg-bg-primary/70"
                            >
                                <span className="pr-4 font-semibold text-text-primary">{item.productName}</span>
                                <span className={`font-black ${getRiskTone(item.riskIndex)}`}>{formatNumber(item.riskIndex)}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="rounded-3xl border border-panel-border bg-panel-bg p-5 shadow-[var(--panel-shadow)]">
                    <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-text-secondary">Топ потреби</div>
                    <div className="mt-4 space-y-3">
                        {data.signals.topNeed.map((item) => (
                            <button
                                key={item.productName}
                                onClick={() => {
                                    setViewMode('sku');
                                    setSelectedSku(item.productName);
                                }}
                                className="flex w-full items-center justify-between rounded-2xl border border-panel-border bg-bg-primary/40 px-4 py-3 text-left hover:bg-bg-primary/70"
                            >
                                <span className="pr-4 font-semibold text-text-primary">{item.productName}</span>
                                <span className="font-black text-amber-500">{formatNumber(item.needNet)}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="rounded-3xl border border-panel-border bg-panel-bg p-5 shadow-[var(--panel-shadow)]">
                    <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-text-secondary">Топ OOS магазинів</div>
                    <div className="mt-4 space-y-3">
                        {data.signals.topOosStores.map((item) => (
                            <div
                                key={item.storeName}
                                className="flex items-center justify-between rounded-2xl border border-panel-border bg-bg-primary/40 px-4 py-3"
                            >
                                <span className="pr-4 font-semibold text-text-primary">{item.storeName}</span>
                                <span className="font-black text-rose-500">{formatNumber(item.zeroStockSkus)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
