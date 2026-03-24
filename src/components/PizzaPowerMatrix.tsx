'use client';

import { useState, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { ProductionTask } from '@/types/bi';
import { cn } from '@/lib/utils';
import { DistributionModal } from './DistributionModal';
import { ProductionDetailModal } from './ProductionDetailModal';
import { ProductDetailDrawer } from './production/ProductDetailDrawer';
import { StoreDetailDrawer } from './production/StoreDetailDrawer';


interface Props {
    data: ProductionTask[];
    onRefresh: () => void;
    initialViewMode?: 'products' | 'stores';
}

export const PizzaPowerMatrix = ({ data, initialViewMode = 'products' }: Props) => {
    // STATE
    const planningDays = 3;
    const [viewMode, setViewMode] = useState<'products' | 'stores'>(initialViewMode);
    const [selectedDrawerProductCode, setSelectedDrawerProductCode] = useState<number | null>(null);
    const [selectedDrawerStoreId, setSelectedDrawerStoreId] = useState<number | null>(null);

    const [showDistModal, setShowDistModal] = useState(false);
    const [showProductionModal, setShowProductionModal] = useState(false);


    const handleCardClick = (code: number) => {
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
            <div className="px-6 py-3 flex items-center justify-start border-b border-slate-200 z-10 sticky top-0 bg-white/95 backdrop-blur-md transition-colors duration-200 mt-2">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                    <button
                        onClick={() => setViewMode('products')}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all focus:outline-none uppercase font-[family-name:var(--font-chakra)]",
                            viewMode === 'products'
                                ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                                : "text-slate-500 hover:text-slate-800 hover:bg-white/60 border border-transparent"
                        )}
                    >
                        Продукція
                    </button>
                    <button
                        onClick={() => setViewMode('stores')}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all focus:outline-none uppercase font-[family-name:var(--font-chakra)]",
                            viewMode === 'stores'
                                ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                                : "text-slate-500 hover:text-slate-800 hover:bg-white/60 border border-transparent"
                        )}
                    >
                        Магазини
                    </button>
                </div>
            </div>

            {/* 🔥 CARD GRID LAYOUT */}
            <main className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {viewMode === 'products' ? (
                    /* PRODUCTS VIEW */
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 pb-20 mt-4">
                        {products.map(product => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const criticalStores = product.stores.filter((s: any) => s.computed.isUrgent).length;
                            const hasIssues = criticalStores > 0;
                            const isOutOfStock = product.computed.totalStock === 0 && product.computed.totalRecommended > 0;

                            const dotColorClass = hasIssues ? "bg-red-500" : "bg-emerald-500";
                            const actualColorClass = hasIssues ? "text-red-500" : "text-emerald-600";
                            const progressColorClass = hasIssues ? "bg-red-400" : "bg-emerald-400";
                            const fillPercent = Math.min(100, (product.computed.totalStock / (Math.max(1, product.computed.totalMinStock) * 1.5)) * 100);

                            return (
                                <div
                                    key={product.id}
                                    id={`product-${product.productCode}`}
                                    onClick={() => handleCardClick(product.productCode)}
                                    className={cn(
                                        "bg-white border rounded-xl transition-all flex flex-col cursor-pointer overflow-hidden group hover:shadow-md",
                                        hasIssues ? "border-red-200 hover:border-red-300" : "border-slate-200 hover:border-blue-200"
                                    )}
                                >
                                    {/* STATUS BAR TOP */}
                                    <div className={cn("h-1 w-full flex-shrink-0", hasIssues ? "bg-red-400" : "bg-emerald-400")} />

                                    {/* CARD BODY */}
                                    <div className="flex flex-col flex-1 p-3">
                                        {/* NAME */}
                                        <h3 className="text-[11px] font-bold text-slate-700 tracking-tight group-hover:text-blue-600 transition-colors leading-tight font-[family-name:var(--font-chakra)] uppercase text-center mb-2 min-h-[28px] flex items-center justify-center">
                                            {product.name}
                                        </h3>

                                        {isOutOfStock ? (
                                            <div className="flex-1 flex items-center justify-center italic text-[9px] text-red-500 font-medium uppercase tracking-wider text-center">
                                                НЕМАЄ / ДЕФІЦИТ
                                            </div>
                                        ) : (
                                            <>
                                                {/* ФАКТ / ЦІЛЬ */}
                                                <div className="flex items-stretch gap-0 mb-2">
                                                    <div className="flex-1 flex flex-col items-center">
                                                        <span className="text-[8px] uppercase font-bold text-slate-400 tracking-widest mb-0.5">ФАКТ</span>
                                                        <span className={cn("text-xl font-bold leading-none tabular-nums", actualColorClass)}>
                                                            {product.computed.totalStock.toFixed(0)}
                                                        </span>
                                                    </div>
                                                    <div className="w-px bg-slate-100 mx-1" />
                                                    <div className="flex-1 flex flex-col items-center">
                                                        <span className="text-[8px] uppercase font-bold text-slate-400 tracking-widest mb-0.5">ЦІЛЬ</span>
                                                        <span className="text-xl font-bold leading-none tabular-nums text-slate-400">
                                                            {product.computed.totalRecommended.toFixed(0)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* МІН ЗАПАС + PROGRESS */}
                                                <div className="mt-auto pt-1 border-t border-slate-100">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-[8px] uppercase text-slate-400 tracking-widest">Мін.</span>
                                                        <span className="text-[9px] font-bold text-slate-500 tabular-nums">{product.computed.totalMinStock.toFixed(0)}</span>
                                                    </div>
                                                    <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={cn("h-full rounded-full transition-all duration-500", progressColorClass)}
                                                            style={{ width: `${fillPercent}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl flex flex-col justify-center items-center gap-2 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer group overflow-hidden">
                            <div className="h-1 w-full bg-transparent" />
                            <div className="flex flex-col flex-1 items-center justify-center p-3 gap-2">
                                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                                    <span className="text-slate-400 group-hover:text-blue-500 text-lg font-light leading-none">+</span>
                                </div>
                                <span className="text-[10px] font-medium text-slate-400 group-hover:text-slate-600 uppercase tracking-wider text-center">Додати</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* STORES VIEW */
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 pb-20">
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
                                    className={cn(
                                        "bg-white border rounded-2xl transition-all duration-200 overflow-hidden group hover:shadow-sm cursor-pointer",
                                        hasIssues ? "border-red-200 hover:border-red-300" : "border-slate-200 hover:border-blue-200"
                                    )}
                                >
                                    {/* STORE CARD HEADER */}
                                    <div className={cn("p-4 transition-colors relative", hasIssues && "bg-red-50/50")}>
                                        <div className="flex items-center justify-between mb-2 relative z-10">
                                            <h3 className="text-base font-semibold text-slate-800 tracking-widest leading-tight truncate pr-2 uppercase font-[family-name:var(--font-chakra)] group-hover:text-blue-600 transition-colors">
                                                {store.storeName.replace('Магазин ', '').replace(/"/g, '')}
                                            </h3>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 relative z-10">
                                            <div className="bg-slate-50 rounded-xl p-2 text-center border border-slate-100">
                                                <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5 font-bold">ЗАПАС</div>
                                                <div className={cn(
                                                    "text-xl font-bold",
                                                    hasIssues ? "text-red-500" : "text-emerald-500"
                                                )}>
                                                    {store.totalStock.toFixed(0)}
                                                </div>
                                            </div>
                                            <div className={cn(
                                                "rounded-xl p-2 text-center border",
                                                store.criticalProducts > 0 ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100"
                                            )}>
                                                <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5 font-bold">КРИТИЧНО</div>
                                                <div className={cn(
                                                    "text-xl font-bold",
                                                    store.criticalProducts > 0 ? "text-red-500" : "text-emerald-500"
                                                )}>
                                                    {store.criticalProducts}
                                                </div>
                                            </div>

                                            {/* AVG SALES METRIC */}
                                            <div className="bg-blue-50 rounded-xl p-2 text-center border border-blue-100 flex flex-col justify-center">
                                                <div className="flex items-center justify-center gap-1 text-[8px] text-blue-500 uppercase tracking-widest font-bold mb-0.5 whitespace-nowrap">
                                                    <TrendingUp size={10} />
                                                    <span>ПРОДАЖІ</span>
                                                </div>
                                                <div className="text-xl font-bold text-blue-500 leading-none">
                                                    {store.totalAvgSales.toFixed(0)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-3 relative z-10">
                                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                                <div
                                                    className={cn(
                                                        "h-full rounded-full transition-all",
                                                        fillPercent >= 100 ? "bg-emerald-400" :
                                                            fillPercent < 50 ? "bg-red-400" : "bg-amber-400"
                                                    )}
                                                    style={{ width: `${Math.min(100, fillPercent)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* DISTRIBUTION MODAL */}
            <DistributionModal
                isOpen={showDistModal}
                onClose={() => setShowDistModal(false)}
                products={data}
            />

            {/* PRODUCTION MODAL */}
            <ProductionDetailModal
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
