import React from 'react';
import { X, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store: any | null; // Store object from PizzaPowerMatrix (storesGrouped context)
}

export function StoreDetailDrawer({ isOpen, onClose, store }: DrawerProps) {
    if (!isOpen || !store) {
        return null; // Don't render if not open or no store
    }

    const { products = [] } = store;

    // Handle closing when clicking outside the panel
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md transition-opacity p-4 lg:p-8 lg:pl-[280px]"
            onClick={handleBackdropClick}
        >
            <div
                className="w-full max-w-[1400px] h-auto max-h-[90vh] rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-2xl flex flex-col transform transition-transform animate-in zoom-in-95 duration-200"
            >
                {/* HEAD */}
                <div className="flex items-start justify-between p-5 px-8 border-b border-slate-200 shrink-0">
                    <div className="flex items-center gap-12">
                        <div className="flex flex-col justify-center">
                            <div className="text-[10px] text-blue-500 font-bold uppercase tracking-[0.2em] flex items-center gap-2">
                                <span>Деталі локації</span>
                            </div>
                            <h2 className="text-3xl font-bold text-slate-900 uppercase tracking-wider leading-none mt-2">
                                {store.storeName.replace('Магазин ', '').replace(/"/g, '')}
                            </h2>
                        </div>

                        {/* Summary Metrics Inline with Title */}
                        <div className="flex items-center gap-6 mt-2">
                            <div className="flex flex-col justify-end">
                                <div className="text-[9px] uppercase font-bold text-slate-400 tracking-[0.2em] mb-1">Факт Залишок</div>
                                <div className={cn(
                                    "text-3xl font-mono font-black leading-none flex items-baseline gap-1",
                                    store.criticalProducts > 0 ? "text-red-500" : "text-emerald-500"
                                )}>
                                    {store.totalStock.toFixed(0)} <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">шт</span>
                                </div>
                            </div>
                            <div className="w-px h-10 bg-slate-200 hidden md:block"></div>
                            <div className="flex flex-col justify-end">
                                <div className="text-[9px] uppercase font-bold text-slate-400 tracking-[0.2em] mb-1">Крит. Дефіцити</div>
                                <div className={cn(
                                    "text-3xl font-mono font-black leading-none flex items-baseline gap-1",
                                    store.criticalProducts > 0 ? "text-red-500" : "text-slate-300"
                                )}>
                                    {store.criticalProducts} <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">позицій</span>
                                </div>
                            </div>
                            <div className="w-px h-10 bg-slate-200 hidden md:block"></div>
                            <div className="flex flex-col justify-end">
                                <div className="text-[9px] uppercase font-bold text-blue-500 tracking-[0.2em] mb-1 flex items-center gap-1">
                                    <TrendingUp size={10} /> Середні продажі
                                </div>
                                <div className="text-3xl font-mono font-black text-blue-500 leading-none flex items-baseline gap-1">
                                    {store.totalAvgSales.toFixed(0)} <span className="text-[11px] font-bold text-blue-300 uppercase tracking-wider">шт/день</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-3 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors mt-2"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* PRODUCTS GRID */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        {products.sort((a: any, b: any) => b.avg - a.avg).map((prod: any) => {
                            const isLowStock = prod.isUrgent;

                            return (
                                <div
                                    key={prod.productCode}
                                    className={cn(
                                        "rounded-xl p-4 flex flex-col gap-2 transition-all duration-200 relative overflow-hidden group",
                                        isLowStock
                                            ? "bg-red-50 border border-red-200 hover:border-red-300"
                                            : "bg-white border border-slate-200 hover:border-blue-200 hover:shadow-sm"
                                    )}
                                >
                                    <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-blue-200 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                                    {/* Product Name */}
                                    <div
                                        className="text-sm font-semibold text-slate-900 uppercase tracking-wider text-center font-[family-name:var(--font-chakra)] line-clamp-2 min-h-[2.5em] flex items-center justify-center"
                                        title={prod.productName}
                                    >
                                        {prod.productName}
                                    </div>

                                    {/* Metrics Row */}
                                    <div className="grid grid-cols-3 gap-2 mt-2">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold tracking-[0.2em] text-slate-400 mb-1 uppercase font-[family-name:var(--font-jetbrains)]">Факт</span>
                                            <span className={cn(
                                                "text-lg font-bold leading-none",
                                                isLowStock ? "text-red-500" : "text-emerald-500"
                                            )}>
                                                {prod.stock.toFixed(0)}
                                            </span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold tracking-[0.2em] text-slate-400 mb-1 uppercase font-[family-name:var(--font-jetbrains)]">Мін</span>
                                            <span className="text-lg font-bold leading-none text-slate-600">
                                                {prod.minStock.toFixed(0)}
                                            </span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold tracking-[0.2em] text-slate-400 mb-1 uppercase font-[family-name:var(--font-jetbrains)]">Сер</span>
                                            <span className="text-lg font-bold leading-none text-blue-500">
                                                {prod.avg.toFixed(1)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
