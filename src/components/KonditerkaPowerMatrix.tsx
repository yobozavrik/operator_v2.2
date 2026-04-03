'use client';

import { useState, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { ProductionTask } from '@/types/bi';
import { cn } from '@/lib/utils';
import { KonditerkaDistributionModal } from './KonditerkaDistributionModal';
import { KonditerkaProductionDetailModal } from './KonditerkaProductionDetailModal';
import { ProductDetailDrawer } from './production/ProductDetailDrawer';
import { StoreDetailDrawer } from './production/StoreDetailDrawer';


interface Props {
    data: ProductionTask[];
    onRefresh: () => void;
    initialViewMode?: 'products' | 'stores';
}

export const KonditerkaPowerMatrix = ({ data, initialViewMode = 'products' }: Props) => {
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
        <div className="flex flex-col h-full w-full font-sans text-slate-900 bg-white min-h-screen">

            {/* HEADER TOGGLE */}
            <div className="px-6 py-4 flex items-center justify-start border-b border-slate-200 z-10 sticky top-0 bg-white/80 backdrop-blur-md transition-colors duration-300 mt-2">
                <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                    <button
                        onClick={() => setViewMode('products')}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all focus:outline-none uppercase font-[family-name:var(--font-chakra)]",
                            viewMode === 'products'
                                ? "bg-white text-blue-600 shadow-sm border border-blue-100"
                                : "text-slate-500 hover:text-slate-900 hover:bg-white/50 border border-transparent"
                        )}
                    >
                        Products
                    </button>
                    <button
                        onClick={() => setViewMode('stores')}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all focus:outline-none uppercase font-[family-name:var(--font-chakra)]",
                            viewMode === 'stores'
                                ? "bg-white text-blue-600 shadow-sm border border-blue-100"
                                : "text-slate-500 hover:text-slate-900 hover:bg-white/50 border border-transparent"
                        )}
                    >
                        Locations
                    </button>
                </div>
            </div>

            {/* 🔥 CARD GRID LAYOUT */}
            <main className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {viewMode === 'products' ? (
                    /* PRODUCTS VIEW */
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 pb-20 mt-4">
                        {visibleProducts.map(product => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const criticalStores = product.stores.filter((s: any) => s.computed.isUrgent).length;
                            const hasIssues = criticalStores > 0;
                            const isOutOfStock = product.computed.totalStock === 0 && product.computed.totalRecommended > 0;

                            const dotColorClass = hasIssues ? "bg-red-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]";
                            const actualColorClass = hasIssues ? "text-red-600" : "text-slate-900";
                            const progressColorClass = hasIssues ? "bg-red-500" : "bg-emerald-500";
                            const fillPercent = Math.min(100, (product.computed.totalStock / (Math.max(1, product.computed.totalMinStock) * 1.5)) * 100);

                            return (
                                <div
                                    key={product.id}
                                    id={`product-${product.productCode}`}
                                    onClick={() => handleCardClick(product.productCode)}
                                    className="bg-white p-4 rounded-xl transition-all flex flex-col gap-2 group hover:shadow-md border border-slate-200 hover:border-blue-200 cursor-pointer min-h-[120px] relative overflow-hidden"
                                >
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                    <div className="flex flex-col items-center relative z-10 pt-1">
                                        <div className={`absolute top-0 right-0 w-2 h-2 rounded-full ${dotColorClass} flex-shrink-0`}></div>
                                        <h3 className="text-sm font-bold text-slate-900 tracking-tight group-hover:text-blue-600 transition-colors leading-tight line-clamp-2 font-[family-name:var(--font-chakra)] uppercase text-center w-full px-2">
                                            {product.name}
                                        </h3>
                                    </div>

                                    {isOutOfStock ? (
                                        <div className="flex-1 flex items-center justify-center italic text-[10px] text-red-500 font-medium font-[family-name:var(--font-jetbrains)] uppercase tracking-[0.2em] text-center">
                                            Out of stock / Deficit
                                        </div>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-2 gap-2 my-1 relative z-10">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] uppercase font-bold text-slate-400 mb-0 font-[family-name:var(--font-jetbrains)] tracking-widest">Act</span>
                                                    <span className={`text-2xl font-bold font-[family-name:var(--font-jetbrains)] ${actualColorClass} leading-none`}>
                                                        {product.computed.totalStock.toFixed(0)}
                                                        <span className="text-[12px] opacity-70 ml-1 font-normal text-slate-400">{product.unit || 'шт'}</span>
                                                    </span>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[9px] uppercase font-bold text-slate-400 mb-0 font-[family-name:var(--font-jetbrains)] tracking-widest">Tgt</span>
                                                    <span className="text-2xl font-bold text-blue-600 font-[family-name:var(--font-jetbrains)] leading-none">
                                                        {product.computed.totalRecommended.toFixed(0)}
                                                        <span className="text-[12px] opacity-70 ml-1 font-normal text-slate-400">{product.unit || 'шт'}</span>
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="space-y-2 pt-2 border-t border-slate-100 mt-auto relative z-10">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-slate-400 font-[family-name:var(--font-jetbrains)] uppercase text-[9px] tracking-widest">Min. Stock</span>
                                                    <span className="font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-[family-name:var(--font-jetbrains)] text-[10px]">
                                                        {product.computed.totalMinStock.toFixed(0)} {product.unit || 'шт'}
                                                    </span>
                                                </div>
                                                <div className="relative pt-0.5">
                                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${progressColorClass}`}
                                                            style={{ width: `${fillPercent}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}

                        <div className="bg-slate-50 p-4 rounded-xl flex flex-col justify-center items-center gap-2 border-dashed border-2 border-slate-200 hover:border-blue-300 hover:bg-white transition-all cursor-pointer group min-h-[120px]">
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-slate-100 group-hover:border-blue-200 transition-colors">
                                <span className="text-slate-400 group-hover:text-blue-500 text-xl font-light">+</span>
                            </div>
                            <span className="text-xs font-medium text-slate-400 group-hover:text-slate-600 mt-1 font-[family-name:var(--font-chakra)] uppercase tracking-wider text-center">Add Product</span>
                        </div>
                    </div>
                ) : (
                    /* STORES VIEW */
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 pb-20 mt-4">
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
                                    className="bg-white rounded-2xl transition-all duration-300 overflow-hidden group hover:shadow-md border border-slate-200 hover:border-blue-200 cursor-pointer"
                                >
                                    {/* STORE CARD HEADER */}
                                    <div
                                        className={cn(
                                            "p-4 transition-colors relative",
                                            "hover:bg-slate-50",
                                            hasIssues && "bg-red-50/50"
                                        )}
                                    >
                                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                        <div className="flex items-center justify-center mb-2 relative z-10">
                                            <h3 className="text-base font-semibold text-slate-900 tracking-widest leading-tight truncate px-2 uppercase font-[family-name:var(--font-chakra)] group-hover:text-blue-600 transition-colors text-center w-full">
                                                {store.storeName.replace('Магазин ', '').replace(/"/g, '')}
                                            </h3>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 relative z-10">
                                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-2 text-center">
                                                <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5 font-[family-name:var(--font-jetbrains)] font-bold">Stock</div>
                                                <div className={cn(
                                                    "text-xl font-bold font-[family-name:var(--font-jetbrains)]",
                                                    hasIssues ? "text-red-600" : "text-emerald-600"
                                                )}>
                                                    {store.totalStock.toFixed(0)} <span className="text-[10px] opacity-70">од.</span>
                                                </div>
                                            </div>
                                            <div className={cn(
                                                "rounded-xl p-2 text-center border",
                                                store.criticalProducts > 0 ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100"
                                            )}>
                                                <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5 font-[family-name:var(--font-jetbrains)] font-bold">Critical</div>
                                                <div className={cn(
                                                    "text-xl font-bold font-[family-name:var(--font-jetbrains)]",
                                                    store.criticalProducts > 0 ? "text-red-600" : "text-emerald-600"
                                                )}>
                                                    {store.criticalProducts}
                                                </div>
                                            </div>

                                            {/* AVG SALES METRIC */}
                                            <div className="bg-blue-50/50 rounded-xl p-2 text-center border border-blue-100 flex flex-col justify-center">
                                                <div className="flex items-center justify-center gap-1 text-[8px] text-blue-500 uppercase tracking-widest font-[family-name:var(--font-jetbrains)] font-bold mb-0.5 whitespace-nowrap">
                                                    <TrendingUp size={10} />
                                                    <span>Sales/Day</span>
                                                </div>
                                                <div className="text-xl font-bold text-blue-600 leading-none font-[family-name:var(--font-jetbrains)]">
                                                    {store.totalAvgSales.toFixed(0)} <span className="text-[10px] opacity-70">од.</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-3 relative z-10">
                                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                                <div
                                                    className={cn(
                                                        "h-full rounded-full transition-all",
                                                        fillPercent >= 100 ? "bg-emerald-500" :
                                                            fillPercent < 50 ? "bg-red-500" : "bg-amber-500"
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
            <KonditerkaDistributionModal
                isOpen={showDistModal}
                onClose={() => setShowDistModal(false)}
                products={data}
            />

            {/* PRODUCTION MODAL */}
            <KonditerkaProductionDetailModal
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
