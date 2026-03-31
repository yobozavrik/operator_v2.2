'use client';

import React from 'react';
import useSWR from 'swr';
import {
    Activity,
    AlertTriangle,
    BarChart3,
    ChefHat,
    Factory,
    Package,
    Store,
    TrendingUp,
} from 'lucide-react';
import { authedFetcher } from '@/lib/authed-fetcher';
import { ProductDetailDrawer } from '@/components/production/ProductDetailDrawer';
import { StoreDetailDrawer } from '@/components/production/StoreDetailDrawer';

type StoreSkuRow = {
    productName: string;
    storeName: string;
    stock: number;
    minStock: number;
    avgSales: number;
    needNet: number;
    fillRate: number;
    bakedAtFactory: number;
};

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
        bakedAtFactory: number;
        zeroStockStores: number;
        storesCovered: number;
        targetStock: number;
        gapToTarget: number;
        productionGap: number;
        coverageDays: number | null;
        riskIndex: number;
    }>;
    stores: Array<{
        storeName: string;
        totalStock: number;
        minStock: number;
        needNet: number;
        avgSales: number;
        zeroStockSkus: number;
        skuCount: number;
        fillRate: number;
    }>;
    storeSku: StoreSkuRow[];
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
        topRisk: Array<{ productName: string; riskIndex: number; needNet: number; avgSales: number }>;
        topNeed: Array<{ productName: string; needNet: number; bakedAtFactory: number; targetStock: number }>;
        topOosStores: Array<{ storeName: string; zeroStockSkus: number; needNet: number; fillRate: number }>;
    };
};

type DrawerProduct = {
    name: string;
    unit: string;
    computed: {
        totalStock: number;
        totalRecommended: number;
        totalUrgentDeficit: number;
    };
    stores: Array<{
        storeName: string;
        computed: {
            stock: number;
            minStock: number;
            avg: number;
        };
    }>;
};

type DrawerStore = {
    storeName: string;
    totalStock: number;
    criticalProducts: number;
    totalAvgSales: number;
    products: Array<{
        productName: string;
        productCode: string;
        stock: number;
        avg: number;
        minStock: number;
        recommended: number;
        urgentDeficit: number;
        isUrgent: boolean;
    }>;
};

const fetcher = authedFetcher;

function formatNumber(value: number, digits = 0) {
    return new Intl.NumberFormat('uk-UA', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(value);
}

function SectionCard({
    title,
    icon: Icon,
    children,
}: {
    title: string;
    icon: typeof BarChart3;
    children: React.ReactNode;
}) {
    return (
        <section className="rounded-3xl border border-panel-border bg-panel-bg shadow-[var(--panel-shadow)] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-panel-border bg-bg-primary/40">
                <div className="w-10 h-10 rounded-2xl bg-accent-primary/10 text-accent-primary flex items-center justify-center">
                    <Icon size={18} />
                </div>
                <h2 className="text-sm md:text-base font-black uppercase tracking-[0.2em] text-text-primary font-[family-name:var(--font-chakra)]">
                    {title}
                </h2>
            </div>
            <div className="p-5">{children}</div>
        </section>
    );
}

function ClickableSignalCard({
    title,
    subtitle,
    value,
    valueClassName,
    onClick,
}: {
    title: string;
    subtitle: string;
    value: string;
    valueClassName: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full rounded-2xl border border-panel-border bg-bg-primary/40 p-4 text-left transition-all hover:border-accent-primary/30 hover:bg-bg-primary/70 hover:shadow-sm"
        >
            <div className="font-semibold text-text-primary">{title}</div>
            <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-text-secondary">{subtitle}</span>
                <span className={valueClassName}>{value}</span>
            </div>
        </button>
    );
}

export function PizzaProductionAnalytics() {
    const { data, error, isLoading } = useSWR<AnalyticsResponse>(
        '/api/pizza/analytics/dashboard',
        fetcher,
        { refreshInterval: 60000 }
    );

    const [selectedProduct, setSelectedProduct] = React.useState<DrawerProduct | null>(null);
    const [selectedStore, setSelectedStore] = React.useState<DrawerStore | null>(null);

    const productDrawerMap = React.useMemo(() => {
        if (!data) return new Map<string, DrawerProduct>();

        const grouped = new Map<string, StoreSkuRow[]>();
        for (const row of data.storeSku || []) {
            const bucket = grouped.get(row.productName) || [];
            bucket.push(row);
            grouped.set(row.productName, bucket);
        }

        const result = new Map<string, DrawerProduct>();
        for (const item of data.sku) {
            const rows = grouped.get(item.productName) || [];
            result.set(item.productName, {
                name: item.productName,
                unit: 'sht',
                computed: {
                    totalStock: item.totalStock,
                    totalRecommended: item.needNet,
                    totalUrgentDeficit: item.needNet,
                },
                stores: rows.map((row) => ({
                    storeName: row.storeName,
                    computed: {
                        stock: row.stock,
                        minStock: row.minStock,
                        avg: row.avgSales,
                    },
                })),
            });
        }

        return result;
    }, [data]);

    const storeDrawerMap = React.useMemo(() => {
        if (!data) return new Map<string, DrawerStore>();

        const grouped = new Map<string, StoreSkuRow[]>();
        for (const row of data.storeSku || []) {
            const bucket = grouped.get(row.storeName) || [];
            bucket.push(row);
            grouped.set(row.storeName, bucket);
        }

        const result = new Map<string, DrawerStore>();
        for (const item of data.stores) {
            const rows = grouped.get(item.storeName) || [];
            result.set(item.storeName, {
                storeName: item.storeName,
                totalStock: item.totalStock,
                criticalProducts: item.zeroStockSkus,
                totalAvgSales: item.avgSales,
                products: rows.map((row) => ({
                    productName: row.productName,
                    productCode: row.productName,
                    stock: row.stock,
                    avg: row.avgSales,
                    minStock: row.minStock,
                    recommended: row.needNet,
                    urgentDeficit: row.needNet,
                    isUrgent: row.stock <= 0,
                })),
            });
        }

        return result;
    }, [data]);

    const openProduct = React.useCallback((productName: string) => {
        const product = productDrawerMap.get(productName);
        if (product) setSelectedProduct(product);
    }, [productDrawerMap]);

    const openStore = React.useCallback((storeName: string) => {
        const store = storeDrawerMap.get(storeName);
        if (store) setSelectedStore(store);
    }, [storeDrawerMap]);

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] rounded-3xl border border-red-500/20 bg-red-500/5 text-red-400">
                <div className="flex flex-col items-center gap-3">
                    <AlertTriangle size={32} />
                    <span className="text-sm font-bold uppercase tracking-[0.25em]">Помилка завантаження аналітики виробництва</span>
                </div>
            </div>
        );
    }

    if (isLoading || !data) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] rounded-3xl border border-panel-border bg-panel-bg">
                <div className="flex flex-col items-center gap-4 text-text-secondary">
                    <ChefHat size={40} className="animate-pulse text-accent-primary" />
                    <span className="text-sm font-bold uppercase tracking-[0.25em]">Завантаження аналітики виробництва</span>
                </div>
            </div>
        );
    }

    const { overview, sku, stores, planVsFact, signals } = data;

    return (
        <>
            <div className="space-y-6">
                <div className="rounded-3xl border border-panel-border bg-panel-bg shadow-[var(--panel-shadow)] p-6">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.35em] text-text-secondary font-bold">Виробництво піци</p>
                            <h1 className="mt-2 text-3xl font-black uppercase tracking-[0.12em] text-text-primary font-[family-name:var(--font-chakra)]">
                                Планування та операційний контроль
                            </h1>
                            <p className="mt-3 text-sm text-text-secondary max-w-3xl">
                                Операційний екран для залишків, потреби, виробництва, ризику та точок із найбільшою кількістю OOS.
                            </p>
                        </div>
                        <div className="text-xs text-text-secondary uppercase tracking-[0.2em] font-[family-name:var(--font-jetbrains)]">
                            Оновлено: {new Date(data.generatedAt).toLocaleString('uk-UA')}
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-3xl border border-panel-border bg-panel-bg p-5 shadow-[var(--panel-shadow)]">
                        <div className="flex items-center gap-2 text-text-secondary text-[11px] uppercase tracking-[0.25em] font-bold">
                            <Package size={14} className="text-accent-primary" />
                            SKU
                        </div>
                        <div className="mt-3 text-4xl font-black text-text-primary">{formatNumber(overview.totalSkus)}</div>
                        <div className="mt-2 text-sm text-text-secondary">Активні піци у виробничому контурі</div>
                    </div>

                    <div className="rounded-3xl border border-panel-border bg-panel-bg p-5 shadow-[var(--panel-shadow)]">
                        <div className="flex items-center gap-2 text-text-secondary text-[11px] uppercase tracking-[0.25em] font-bold">
                            <Store size={14} className="text-status-success" />
                            Магазини
                        </div>
                        <div className="mt-3 text-4xl font-black text-text-primary">{formatNumber(overview.totalStores)}</div>
                        <div className="mt-2 text-sm text-text-secondary">Точки в поточному контурі</div>
                    </div>

                    <div className="rounded-3xl border border-panel-border bg-panel-bg p-5 shadow-[var(--panel-shadow)]">
                        <div className="flex items-center gap-2 text-text-secondary text-[11px] uppercase tracking-[0.25em] font-bold">
                            <Activity size={14} className="text-orange-400" />
                            Запас / Норма
                        </div>
                        <div className="mt-3 text-4xl font-black text-text-primary">{formatNumber(overview.fillIndex, 0)}%</div>
                        <div className="mt-2 text-sm text-text-secondary">
                            {formatNumber(overview.totalStock)} шт проти {formatNumber(overview.totalMinStock)} шт норми
                        </div>
                    </div>

                    <div className="rounded-3xl border border-panel-border bg-panel-bg p-5 shadow-[var(--panel-shadow)]">
                        <div className="flex items-center gap-2 text-text-secondary text-[11px] uppercase tracking-[0.25em] font-bold">
                            <Factory size={14} className="text-rose-400" />
                            Виробництво / Потреба
                        </div>
                        <div className="mt-3 text-4xl font-black text-text-primary">{formatNumber(overview.totalBaked)}</div>
                        <div className="mt-2 text-sm text-text-secondary">
                            Поточна потреба: {formatNumber(overview.totalNeed)} шт
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                    <SectionCard title="SKU" icon={BarChart3}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-text-secondary uppercase text-[11px] tracking-[0.2em]">
                                    <tr>
                                        <th className="text-left pb-3">Pizza</th>
                                        <th className="text-right pb-3">Продаж</th>
                                        <th className="text-right pb-3">Запас</th>
                                        <th className="text-right pb-3">Потреба</th>
                                        <th className="text-right pb-3">Ризик</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sku.slice(0, 12).map((item) => (
                                        <tr
                                            key={item.productName}
                                            className="border-t border-panel-border cursor-pointer transition-colors hover:bg-bg-primary/40"
                                            onClick={() => openProduct(item.productName)}
                                        >
                                            <td className="py-3 pr-4 font-semibold text-text-primary">{item.productName}</td>
                                            <td className="py-3 text-right text-text-secondary">{formatNumber(item.avgSales, 1)}</td>
                                            <td className="py-3 text-right text-text-secondary">{formatNumber(item.totalStock)}</td>
                                            <td className="py-3 text-right text-orange-400 font-bold">{formatNumber(item.needNet)}</td>
                                            <td className="py-3 text-right text-accent-primary font-bold">{formatNumber(item.riskIndex)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>

                    <SectionCard title="Магазини" icon={Store}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-text-secondary uppercase text-[11px] tracking-[0.2em]">
                                    <tr>
                                        <th className="text-left pb-3">Магазин</th>
                                        <th className="text-right pb-3">Запас</th>
                                        <th className="text-right pb-3">Потреба</th>
                                        <th className="text-right pb-3">Заповнення</th>
                                        <th className="text-right pb-3">OOS SKU</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stores.slice(0, 12).map((item) => (
                                        <tr
                                            key={item.storeName}
                                            className="border-t border-panel-border cursor-pointer transition-colors hover:bg-bg-primary/40"
                                            onClick={() => openStore(item.storeName)}
                                        >
                                            <td className="py-3 pr-4 font-semibold text-text-primary">{item.storeName}</td>
                                            <td className="py-3 text-right text-text-secondary">{formatNumber(item.totalStock)}</td>
                                            <td className="py-3 text-right text-orange-400 font-bold">{formatNumber(item.needNet)}</td>
                                            <td className="py-3 text-right text-accent-primary font-bold">{formatNumber(item.fillRate, 0)}%</td>
                                            <td className="py-3 text-right text-rose-400 font-bold">{formatNumber(item.zeroStockSkus)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </div>

                <SectionCard title="План vs факт" icon={Factory}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-text-secondary uppercase text-[11px] tracking-[0.2em]">
                                <tr>
                                    <th className="text-left pb-3">Піца</th>
                                    <th className="text-right pb-3">Виробництво</th>
                                    <th className="text-right pb-3">Ціль</th>
                                    <th className="text-right pb-3">Розрив</th>
                                    <th className="text-right pb-3">Днів покриття</th>
                                </tr>
                            </thead>
                            <tbody>
                                {planVsFact.map((item) => (
                                    <tr
                                        key={item.productName}
                                        className="border-t border-panel-border cursor-pointer transition-colors hover:bg-bg-primary/40"
                                        onClick={() => openProduct(item.productName)}
                                    >
                                        <td className="py-3 pr-4 font-semibold text-text-primary">{item.productName}</td>
                                        <td className="py-3 text-right text-text-secondary">{formatNumber(item.bakedAtFactory)}</td>
                                        <td className="py-3 text-right text-text-secondary">{formatNumber(item.targetStock)}</td>
                                        <td className="py-3 text-right text-orange-400 font-bold">{formatNumber(item.productionGap)}</td>
                                        <td className="py-3 text-right text-accent-primary font-bold">
                                            {item.coverageDays === null ? '-' : formatNumber(item.coverageDays, 1)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </SectionCard>

                <div className="grid gap-6 xl:grid-cols-3">
                    <SectionCard title="Топ ризику" icon={TrendingUp}>
                        <div className="space-y-3">
                            {signals.topRisk.map((item) => (
                                <ClickableSignalCard
                                    key={item.productName}
                                    title={item.productName}
                                    subtitle="Ризик"
                                    value={formatNumber(item.riskIndex)}
                                    valueClassName="font-black text-accent-primary"
                                    onClick={() => openProduct(item.productName)}
                                />
                            ))}
                        </div>
                    </SectionCard>

                    <SectionCard title="Топ потреби" icon={Package}>
                        <div className="space-y-3">
                            {signals.topNeed.map((item) => (
                                <ClickableSignalCard
                                    key={item.productName}
                                    title={item.productName}
                                    subtitle="Потреба"
                                    value={formatNumber(item.needNet)}
                                    valueClassName="font-black text-orange-400"
                                    onClick={() => openProduct(item.productName)}
                                />
                            ))}
                        </div>
                    </SectionCard>

                    <SectionCard title="Топ OOS магазинів" icon={AlertTriangle}>
                        <div className="space-y-3">
                            {signals.topOosStores.map((item) => (
                                <ClickableSignalCard
                                    key={item.storeName}
                                    title={item.storeName}
                                    subtitle="OOS SKU"
                                    value={formatNumber(item.zeroStockSkus)}
                                    valueClassName="font-black text-rose-400"
                                    onClick={() => openStore(item.storeName)}
                                />
                            ))}
                        </div>
                    </SectionCard>
                </div>
            </div>

            <ProductDetailDrawer
                isOpen={selectedProduct !== null}
                onClose={() => setSelectedProduct(null)}
                product={selectedProduct}
            />

            <StoreDetailDrawer
                isOpen={selectedStore !== null}
                onClose={() => setSelectedStore(null)}
                store={selectedStore}
            />
        </>
    );
}
