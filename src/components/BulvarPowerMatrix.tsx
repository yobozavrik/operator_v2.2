'use client';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useState, useMemo, useRef, useEffect } from 'react';
import useSWR from 'swr';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ChefHat, AlertTriangle, RefreshCw, RotateCcw, ChevronDown, ChevronRight, Activity, Percent, CheckCircle, Calculator, Truck, TrendingUp, Package, Store } from 'lucide-react';
import { ProductionTask } from '@/types/bi';
import { cn } from '@/lib/utils';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { BackToHome } from '@/components/BackToHome';
import { BulvarDistributionModal } from './BulvarDistributionModal';
import { BulvarProductionDetailModal } from './BulvarProductionDetailModal';
import { ProductDetailDrawer } from './production/ProductDetailDrawer';
import { StoreDetailDrawer } from './production/StoreDetailDrawer';

// 🟢 bulvar LOGIC CONSTANTS
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SAFETY_BUFFER = 2; // Days

interface Props {
    data: ProductionTask[];
    onRefresh: () => void;
    initialViewMode?: 'products' | 'stores';
}

// Internal Component for Distribution Logic per Accordion Item
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ProductAccordionItem = ({
    product,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    planningDays,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isExpanded,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onToggle
}: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    product: any,
    planningDays: number,
    isExpanded: boolean,
    onToggle: () => void
}) => {
    const [totalBaked, setTotalBaked] = useState<number>(0);
    const [distributionPlan, setDistributionPlan] = useState<Record<number, number>>({});
    const [isDistributing, setIsDistributing] = useState(false);

    // Distribution Algorithm
    const handleDistribute = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent accordion toggle
        setIsDistributing(true);

        setTimeout(() => { // Small fake delay for UX
            let remaining = totalBaked;
            const newPlan: Record<number, number> = {};

            const add = (storeId: number, amount: number) => {
                newPlan[storeId] = (newPlan[storeId] || 0) + amount;
                remaining -= amount;
            };

            const stores = product.stores;

            // STEP 1: CRITICAL (Stock < Min Stock)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const totalCriticalNeed = stores.reduce((sum: number, s: any) => sum + s.computed.urgentDeficit, 0);

            if (totalCriticalNeed > 0) {
                if (remaining >= totalCriticalNeed) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    stores.forEach((s: any) => { if (s.computed.urgentDeficit > 0) add(s.storeId, s.computed.urgentDeficit); });
                } else {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    stores.forEach((s: any) => {
                        if (s.computed.urgentDeficit > 0) {
                            const share = Math.floor((s.computed.urgentDeficit / totalCriticalNeed) * remaining);
                            if (share > 0) add(s.storeId, share);
                        }
                    });
                }
            }

            // STEP 2: REMAINING (Proportional to Avg Sales)
            if (remaining > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const totalAvg = stores.reduce((sum: number, s: any) => sum + s.computed.avg, 0);
                if (totalAvg > 0) {
                    const step2Pool = remaining;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    stores.forEach((s: any) => {
                        const rawShare = (s.computed.avg / totalAvg) * step2Pool;
                        add(s.storeId, Math.floor(rawShare));
                    });
                }
            }

            // STEP 3: ROUNDING
            while (remaining > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const sorted = [...stores].sort((a: any, b: any) => a.computed.stock - b.computed.stock);
                for (const s of sorted) {
                    if (remaining <= 0) break;
                    add(s.storeId, 1);
                }
                if (remaining > 0) break;
            }

            setDistributionPlan(newPlan);
            setIsDistributing(false);
        }, 100);
    };

    const totalDistributed = Object.values(distributionPlan).reduce((a, b) => a + b, 0);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    const criticalStoresCount = product.stores.filter((s: any) => s.computed.isUrgent).length;

    return (
        <div className="border-t border-panel-border p-2">
            {/* STORES GRID */}
            <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2 mb-3">
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                {[...product.stores].sort((a: any, b: any) => b.computed.avg - a.computed.avg).map((store: any) => {

                    const isLowStock = store.computed.stock < store.computed.minStock;
                    const planVal = distributionPlan[store.storeId] || 0;

                    // SOFT COLORS
                    const cardBg = isLowStock
                        ? "bg-red-50 border-red-200"
                        : "bg-emerald-50 border-emerald-200";

                    return (
                        <div
                            key={`${product.productCode}-${store.storeName}`}
                            className={cn(
                                "rounded-lg p-2 border flex flex-col gap-1 transition-colors",
                                cardBg
                            )}
                        >
                            {/* Store Name - Compact */}
                            <div className="text-xs font-bold uppercase tracking-wide truncate text-text-primary text-center" title={store.storeName}>
                                {store.storeName.replace('Магазин ', '').replace('"', '').replace('"', '')}
                            </div>

                            {/* Metrics Row - Compact */}
                            <div className="grid grid-cols-3 gap-1 text-[10px] font-mono leading-none mt-0.5">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[9px] text-text-secondary uppercase font-bold">Факт</span>
                                    <span className={cn("font-bold text-lg", isLowStock ? "text-[#E74856]" : "text-emerald-500")}>
                                        {store.computed.stock.toFixed(0)}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-0.5 text-center">
                                    <span className="text-[9px] text-text-secondary uppercase font-bold">Мін</span>
                                    <span className="font-bold text-lg text-accent-primary">{store.computed.minStock.toFixed(0)}</span>
                                </div>
                                <div className="flex flex-col gap-0.5 text-right">
                                    <span className="text-[9px] text-text-secondary uppercase font-bold">Сер</span>
                                    <span className="font-bold text-lg text-amber-500">{store.computed.avg.toFixed(1)}</span>
                                </div>
                            </div>

                            {/* Input Field - Reduced */}
                            <div className="pt-1.5 border-t border-panel-border mt-0.5 flex items-center justify-between">
                                <span className="text-[9px] text-accent-primary font-bold uppercase">План</span>
                                <input
                                    type="number"
                                    value={planVal || ''}
                                    onChange={(e) => {
                                        const val = Number(e.target.value);
                                        setDistributionPlan(prev => ({ ...prev, [store.storeId]: val }));
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className={cn(
                                        "w-14 bg-bg-primary border border-panel-border rounded h-6 text-center font-mono font-bold text-base focus:outline-none focus:border-accent-primary/40",
                                        planVal > 0 ? "text-accent-primary shadow-sm" : "text-text-secondary"
                                    )}
                                    placeholder="-"
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* CONTROLS */}
            <div className="p-3 bg-panel-bg rounded-lg border border-panel-border flex items-center gap-4">
                <div className="flex-1 max-w-xs">
                                <label className="text-[10px] text-text-secondary uppercase font-bold tracking-widest block mb-1">
                        Скільки випечено (од.)
                    </label>
                    <input
                        type="number"
                        value={totalBaked || ''}
                        onChange={(e) => setTotalBaked(Number(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-bg-primary border border-panel-border rounded-lg h-10 px-3 font-mono text-text-primary text-xl font-bold focus:outline-none focus:border-accent-primary/40 focus:ring-1 focus:ring-accent-primary/40 shadow-sm"
                        placeholder="0"
                    />
                </div>

                <button
                    onClick={handleDistribute}
                    disabled={!totalBaked || isDistributing}
                    className="h-10 px-6 bg-accent-primary hover:opacity-90 text-white shadow font-bold uppercase text-xs tracking-wider rounded-lg transition-all disabled:opacity-50 mt-4 flex items-center gap-2"
                >
                    <RotateCcw size={16} className={isDistributing ? "animate-spin" : ""} />
                    Розподілити
                </button>

                <div className="ml-auto mt-4 text-right">
                    <div className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">Нерозподілено</div>
                    <div className={cn("font-mono font-bold text-xl", (totalBaked - totalDistributed) < 0 ? "text-red-500" : "text-text-primary")}>
                        {(totalBaked - totalDistributed).toFixed(0)}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const BulvarPowerMatrix = ({ data, onRefresh, initialViewMode = 'products' }: Props) => {
    // STATE
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [planningDays, setPlanningDays] = useState<number>(3);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [viewMode, setViewMode] = useState<'products' | 'stores'>(initialViewMode);
    const [selectedDrawerProductCode, setSelectedDrawerProductCode] = useState<number | null>(null);
    const [selectedDrawerStoreId, setSelectedDrawerStoreId] = useState<number | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [isUpdatingStock, setIsUpdatingStock] = useState(false);

    const [showDistModal, setShowDistModal] = useState(false);
    const [showProductionModal, setShowProductionModal] = useState(false);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleRefresh = async () => {
        setIsRefreshing(true);
        await onRefresh();
        setTimeout(() => setIsRefreshing(false), 500);
    };

    // 🏭 PRODUCTION SUMMARY
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data: productionSummary } = useSWR('/api/bulvar/summary', (url) => fetch(url, { credentials: 'include' }).then(r => r.json()), { refreshInterval: 30000 });

    // 🔥 WEBHOOK: Update stock from n8n
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleUpdateStock = async () => {
        setIsUpdatingStock(true);
        try {
            const response = await fetch('/api/bulvar/update-stock', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update_stock', timestamp: new Date().toISOString() })
            });

            if (response.ok) {
                // Refresh data after stock update
                await onRefresh();
            } else {
                console.error('Stock update failed:', response.status);
            }
        } catch (error) {
            console.error('Stock update error:', error);
        } finally {
            setIsUpdatingStock(false);
        }
    };


    const handleCardClick = (code: number) => {
        setSelectedDrawerProductCode(code);
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const expandOne = (code: number) => {
        setSelectedDrawerProductCode(code);
    };

    // 1. CALCULATE PRODUCT LEVEL AGGREGATES
    const products = useMemo(() => {
        return data.map(product => {
            let totalAvg = 0;
            let totalStock = 0;
            let totalRecommended = 0;
            let totalUrgentDeficit = 0;
            let totalMinStock = 0;

            const storesWithStats = product.stores.map(store => {
                const avg = (Number(store.avgSales) || 0); // No Multiplier x1000
                const stock = Number(store.currentStock) || 0;

                // Formulas per store
                const minStock = Number(store.minStock) || 0;

                const urgent = Math.max(0, minStock - stock);

                const target = Math.ceil((avg * planningDays) + minStock);
                const recommended = Math.max(0, target - stock);

                totalAvg += avg;
                totalStock += stock;
                totalMinStock += minStock;
                totalRecommended += recommended;
                totalUrgentDeficit += urgent;

                return {
                    ...store,
                    computed: {
                        avg,
                        stock,
                        minStock,
                        recommended,
                        urgentDeficit: urgent,
                        isUrgent: urgent > 0
                    }
                };
            });

            return {
                ...product,
                stores: storesWithStats.sort((a, b) => b.computed.urgentDeficit - a.computed.urgentDeficit),
                computed: {
                    totalAvg,
                    totalStock,
                    totalMinStock,
                    totalRecommended,
                    totalUrgentDeficit
                }
            };
        }).sort((a, b) => {
            if (b.computed.totalUrgentDeficit !== a.computed.totalUrgentDeficit) {
                return b.computed.totalUrgentDeficit - a.computed.totalUrgentDeficit;
            }
            return b.name.localeCompare(a.name);
        });

    }, [data, planningDays]);

    const visibleProducts = useMemo(() => {
        return products
            .filter((product) => product.computed.totalStock > 0)
            .sort((a, b) => a.name.localeCompare(b.name, 'uk', { sensitivity: 'base' }));
    }, [products]);

    // 1.5 GROUP BY STORES (inverted view)
    const storesGrouped = useMemo(() => {
        const storeMap = new Map<string, {
            storeName: string;
            storeId: number;
            products: Array<{
                productName: string;
                productCode: number;
                stock: number;
                avg: number;
                minStock: number;
                recommended: number;
                urgentDeficit: number;
                isUrgent: boolean;
            }>;
            totalStock: number;
            totalMinStock: number;
            totalUrgentDeficit: number;
            criticalProducts: number;
            totalAvgSales: number;
        }>();

        products.forEach(product => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            product.stores.forEach((store: any) => {
                const storeName = store.storeName || 'Unknown';

                if (!storeMap.has(storeName)) {
                    storeMap.set(storeName, {
                        storeName,
                        storeId: store.storeId,
                        products: [],
                        totalStock: 0,
                        totalMinStock: 0,
                        totalUrgentDeficit: 0,
                        criticalProducts: 0,
                        totalAvgSales: 0
                    });
                }

                const entry = storeMap.get(storeName)!;
                entry.products.push({
                    productName: product.name,
                    productCode: product.productCode,
                    stock: store.computed.stock,
                    avg: store.computed.avg,
                    minStock: store.computed.minStock,
                    recommended: store.computed.recommended,
                    urgentDeficit: store.computed.urgentDeficit,
                    isUrgent: store.computed.isUrgent
                });
                entry.totalStock += store.computed.stock;
                entry.totalMinStock += store.computed.minStock;
                entry.totalUrgentDeficit += store.computed.urgentDeficit;
                if (store.computed.isUrgent) entry.criticalProducts++;
                entry.totalAvgSales += store.computed.avg;
            });
        });

        return Array.from(storeMap.values()).sort((a, b) => b.totalAvgSales - a.totalAvgSales);
    }, [products]);

    return (
        <div className="flex flex-col h-full w-full font-sans text-text-primary bg-bg-primary min-h-screen">

            {/* HEADER TOGGLE */}
            <div className="px-3 lg:px-4 py-3 flex items-center justify-start border-b border-panel-border z-10 sticky top-0 bg-panel-bg shadow-[var(--panel-shadow)] transition-colors duration-300">
                <div className="flex items-center gap-2 p-1 bg-bg-primary rounded-xl border border-panel-border">
                    <button
                        onClick={() => setViewMode('products')}
                        className={cn(
                            "px-4 h-10 rounded-lg text-xs font-bold transition-all focus:outline-none uppercase tracking-wider flex items-center justify-center",
                            viewMode === 'products'
                                ? "bg-panel-bg text-accent-primary shadow-sm border border-panel-border"
                                : "text-text-secondary hover:text-text-primary hover:bg-panel-bg/50 border border-transparent"
                        )}
                    >
                        Товари
                    </button>
                    <button
                        onClick={() => setViewMode('stores')}
                        className={cn(
                            "px-4 h-10 rounded-lg text-xs font-bold transition-all focus:outline-none uppercase tracking-wider flex items-center justify-center",
                            viewMode === 'stores'
                                ? "bg-panel-bg text-accent-primary shadow-sm border border-panel-border"
                                : "text-text-secondary hover:text-text-primary hover:bg-panel-bg/50 border border-transparent"
                        )}
                    >
                        Локації
                    </button>
                </div>
            </div>

            {/* 🔥 CARD GRID LAYOUT */}
            <main className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-6 bg-bg-primary">
                {viewMode === 'products' ? (
                    /* PRODUCTS VIEW */
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 pb-20 mt-4">
                        {visibleProducts.map(product => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const criticalStores = product.stores.filter((s: any) => s.computed.isUrgent).length;
                            const hasIssues = criticalStores > 0;

                            return (
                                <div
                                    key={product.id}
                                    id={`product-${product.productCode}`}
                                    onClick={() => handleCardClick(product.productCode)}
                                    className="bg-panel-bg p-4 rounded-2xl transition-all flex flex-col gap-2 group hover:shadow-[var(--panel-shadow-strong)] border border-panel-border hover:border-accent-primary/30 cursor-pointer min-h-[120px] relative overflow-hidden"
                                >
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                    <div className="flex justify-between items-start relative z-10">
                                        <h3 className="text-xs font-semibold text-text-primary tracking-tight group-hover:text-accent-primary transition-colors leading-tight line-clamp-2 uppercase">
                                            {product.name}
                                        </h3>
                                        <div className={`w-2 h-2 rounded-full ${hasIssues ? "bg-red-500" : "bg-emerald-500"} flex-shrink-0 mt-1`}></div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 my-1 relative z-10">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] uppercase font-bold text-text-secondary mb-0 tracking-widest">Факт</span>
                                            <span className={cn("text-2xl font-bold leading-none", hasIssues ? "text-red-600" : "text-text-primary")}>
                                                {product.computed.totalStock.toFixed(0)}
                                                <span className="text-[12px] opacity-70 ml-1 font-normal text-text-secondary">{product.unit || 'шт'}</span>
                                            </span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[9px] uppercase font-bold text-text-secondary mb-0 tracking-widest">Треба</span>
                                            <span className="text-2xl font-bold text-accent-primary leading-none">
                                                {product.computed.totalRecommended.toFixed(0)}
                                                <span className="text-[12px] opacity-70 ml-1 font-normal text-text-secondary">{product.unit || 'шт'}</span>
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-2 border-t border-panel-border mt-auto relative z-10">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-text-secondary font-bold uppercase text-[9px] tracking-widest">Мін. запас</span>
                                            <span className="font-medium text-text-primary bg-bg-primary px-1.5 py-0.5 rounded text-[10px] border border-panel-border">
                                                {product.computed.totalMinStock.toFixed(0)} {product.unit || 'шт'}
                                            </span>
                                        </div>
                                        <div className="relative pt-0.5">
                                            <div className="h-1.5 w-full bg-bg-primary rounded-full overflow-hidden border border-panel-border">
                                                <div
                                                    className={cn("h-full rounded-full transition-all duration-500", hasIssues ? "bg-red-500" : "bg-emerald-500")}
                                                    style={{ width: `${Math.min(100, (product.computed.totalStock / (Math.max(1, product.computed.totalMinStock) * 1.5)) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        <div className="bg-panel-bg p-4 rounded-2xl border-dashed border-2 border-panel-border hover:border-accent-primary/30 hover:bg-panel-bg transition-all cursor-pointer group min-h-[120px] flex flex-col justify-center items-center gap-2">
                            <div className="w-10 h-10 rounded-full bg-bg-primary flex items-center justify-center border border-panel-border group-hover:border-accent-primary/30 transition-colors">
                                <span className="text-text-secondary group-hover:text-accent-primary text-xl font-light">+</span>
                            </div>
                            <span className="text-[10px] font-bold text-text-secondary group-hover:text-text-primary uppercase tracking-[0.2em] text-center">Додати товар</span>
                        </div>
                    </div>
                ) : (
                    /* STORES VIEW */
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 pb-20 mt-4">
                        {storesGrouped.map(store => {
                            const hasIssues = store.criticalProducts > 0;
                            const fillPercent = store.totalMinStock > 0
                                ? (store.totalStock / store.totalMinStock) * 100
                                : 100;

                            return (
                                <div
                                    key={store.storeName}
                                    id={`store-${store.storeId}`}
                                    onClick={() => setSelectedDrawerStoreId(store.storeId)}
                                    className="bg-panel-bg p-4 rounded-2xl transition-all overflow-hidden group hover:shadow-[var(--panel-shadow-strong)] border border-panel-border hover:border-accent-primary/30 cursor-pointer min-h-[120px] relative"
                                >
                                    {/* STORE CARD HEADER */}
                                    <div className="flex items-center justify-between mb-3 relative z-10">
                                        <h3 className="text-sm font-semibold text-text-primary tracking-tight group-hover:text-accent-primary transition-colors leading-tight truncate uppercase">
                                            {store.storeName.replace('Магазин ', '').replace(/"/g, '')}
                                        </h3>
                                        <div className={`w-2 h-2 rounded-full ${hasIssues ? "bg-red-500" : "bg-emerald-500"} flex-shrink-0 mt-1`}></div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-3 relative z-10 mb-2">
                                        <div className="bg-bg-primary rounded-lg p-2 text-center border border-panel-border">
                                            <div className="text-[8px] text-text-secondary uppercase font-bold tracking-widest mb-0.5">Залишок</div>
                                            <div className={cn("text-lg font-bold", hasIssues ? "text-red-600" : "text-text-primary")}>
                                                {store.totalStock.toFixed(0)}
                                            </div>
                                        </div>
                                        <div className={cn("rounded-lg p-2 text-center border", hasIssues ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200")}>
                                            <div className="text-[8px] text-text-secondary uppercase font-bold tracking-widest mb-0.5">Критично</div>
                                            <div className={cn("text-lg font-bold", hasIssues ? "text-red-600" : "text-emerald-600")}>
                                                {store.criticalProducts}
                                            </div>
                                        </div>
                                        <div className="bg-blue-50/50 rounded-lg p-2 text-center border border-blue-100">
                                            <div className="text-[8px] text-blue-500 uppercase font-bold tracking-widest mb-0.5">Сер/день</div>
                                            <div className="text-lg font-bold text-accent-primary">
                                                {store.totalAvgSales.toFixed(0)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-auto pt-2 relative z-10">
                                        <div className="h-1.5 bg-bg-primary rounded-full overflow-hidden border border-panel-border">
                                            <div
                                                className={cn(
                                                    "h-full rounded-full transition-all",
                                                    fillPercent >= 100 ? "bg-emerald-500" :
                                                        fillPercent < 50 ? "bg-red-500" : "bg-amber-400"
                                                )}
                                                style={{ width: `${Math.min(100, fillPercent)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* DISTRIBUTION MODAL */}
            <BulvarDistributionModal
                isOpen={showDistModal}
                onClose={() => setShowDistModal(false)}
                products={data}
            />

            {/* PRODUCTION MODAL */}
            <BulvarProductionDetailModal
                isOpen={showProductionModal}
                onClose={() => setShowProductionModal(false)}
            />

            {/* PRODUCT DETAIL SIDE DRAWER */}
            <ProductDetailDrawer
                isOpen={selectedDrawerProductCode !== null}
                onClose={() => setSelectedDrawerProductCode(null)}
                product={products.find(p => p.productCode === selectedDrawerProductCode)}
            />

            {/* STORE DETAIL DRAWER */}
            <StoreDetailDrawer
                isOpen={selectedDrawerStoreId !== null}
                onClose={() => setSelectedDrawerStoreId(null)}
                store={storesGrouped.find(s => s.storeId === selectedDrawerStoreId)}
            />
        </div>
    );
};
