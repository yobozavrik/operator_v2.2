'use client';

import React from 'react';
import { X, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store: any | null;
}

export function StoreDetailDrawer({ isOpen, onClose, store }: DrawerProps) {
    if (!isOpen || !store) {
        return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products = Array.isArray(store.products) ? store.products : [];

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md transition-opacity lg:p-8 lg:pl-[280px]"
            onClick={handleBackdropClick}
        >
            <div className="flex h-auto max-h-[90vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-slate-200 px-8 py-5">
                    <div className="flex items-center gap-12">
                        <div className="flex flex-col justify-center">
                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500">
                                <span>Деталі локації</span>
                            </div>
                            <h2 className="mt-2 text-3xl font-bold uppercase leading-none tracking-wider text-slate-900">
                                {String(store.storeName || '').replace('Магазин ', '').replace(/"/g, '')}
                            </h2>
                        </div>

                        <div className="mt-2 flex items-center gap-6">
                            <div className="flex flex-col justify-end">
                                <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">Факт залишок</div>
                                <div className={cn(
                                    'flex items-baseline gap-1 text-3xl font-black leading-none font-mono',
                                    Number(store.criticalProducts || 0) > 0 ? 'text-red-500' : 'text-emerald-500'
                                )}>
                                    {Number(store.totalStock || 0).toFixed(0)}
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">шт</span>
                                </div>
                            </div>
                            <div className="hidden h-10 w-px bg-slate-200 md:block" />
                            <div className="flex flex-col justify-end">
                                <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">OOS позиції</div>
                                <div className={cn(
                                    'flex items-baseline gap-1 text-3xl font-black leading-none font-mono',
                                    Number(store.criticalProducts || 0) > 0 ? 'text-red-500' : 'text-slate-300'
                                )}>
                                    {Number(store.criticalProducts || 0)}
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">sku</span>
                                </div>
                            </div>
                            <div className="hidden h-10 w-px bg-slate-200 md:block" />
                            <div className="flex flex-col justify-end">
                                <div className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.2em] text-blue-500">
                                    <TrendingUp size={10} /> Середні продажі
                                </div>
                                <div className="flex items-baseline gap-1 text-3xl font-black leading-none font-mono text-blue-500">
                                    {Number(store.totalAvgSales || 0).toFixed(0)}
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300">шт/день</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="mt-2 rounded-xl bg-slate-100 p-3 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50 p-6 custom-scrollbar">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {products.sort((a: any, b: any) => Number(b.avg || 0) - Number(a.avg || 0)).map((prod: any) => {
                            const isOos = Number(prod.stock || 0) <= 0;

                            return (
                                <div
                                    key={prod.productCode}
                                    className={cn(
                                        'group relative flex flex-col gap-2 overflow-hidden rounded-xl p-4 transition-all duration-200',
                                        isOos
                                            ? 'border border-red-200 bg-red-50 hover:border-red-300'
                                            : 'border border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm'
                                    )}
                                >
                                    <div className="pointer-events-none absolute left-0 top-0 h-0.5 w-full bg-gradient-to-r from-transparent via-blue-200 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                                    <div
                                        className="flex min-h-[2.5em] items-center justify-center text-center font-[family-name:var(--font-chakra)] text-sm font-semibold uppercase tracking-wider text-slate-900 line-clamp-2"
                                        title={prod.productName}
                                    >
                                        {prod.productName}
                                    </div>

                                    <div className="mt-2 grid grid-cols-3 gap-2">
                                        <div className="flex flex-col items-center">
                                            <span className="mb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 font-[family-name:var(--font-jetbrains)]">Факт</span>
                                            <span className={cn('text-lg font-bold leading-none', isOos ? 'text-red-500' : 'text-emerald-500')}>
                                                {Number(prod.stock || 0).toFixed(0)}
                                            </span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="mb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 font-[family-name:var(--font-jetbrains)]">Мін</span>
                                            <span className="text-lg font-bold leading-none text-slate-600">
                                                {Number(prod.minStock || 0).toFixed(0)}
                                            </span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="mb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 font-[family-name:var(--font-jetbrains)]">Сер</span>
                                            <span className="text-lg font-bold leading-none text-blue-500">
                                                {Number(prod.avg || 0).toFixed(1)}
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
