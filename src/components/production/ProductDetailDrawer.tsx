'use client';

import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    product: any | null;
}

function isKgUnit(unit: unknown): boolean {
    const normalized = String(unit || '').trim().toLowerCase();
    return normalized === 'кг' || normalized === 'kg';
}

function packLabel(packs: unknown): string {
    const safe = Number(packs || 0);
    if (!Number.isFinite(safe) || safe <= 0) return '0 уп.';
    return `~${safe} уп.`;
}

export function ProductDetailDrawer({ isOpen, onClose, product }: DrawerProps) {
    if (!isOpen || !product) {
        return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stores = Array.isArray(product.stores) ? product.stores : [];
    const unit = String(product.unit || 'шт').trim() || 'шт';
    const kgUnit = isKgUnit(unit);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const packagingEnabled = Boolean(stores.some((store: any) => store.packaging_enabled));

    const formatStock = (value: number) => (kgUnit ? value.toFixed(2) : value.toFixed(0));
    const formatMetric = (value: number) => (kgUnit ? value.toFixed(1) : value.toFixed(0));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalStockPacks = stores.reduce((sum: number, store: any) => sum + Number(store.stock_now_packs_est || 0), 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalNeedPacks = stores.reduce((sum: number, store: any) => sum + Number(store.need_net_packs_est || 0), 0);

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
                                <span>Деталі товару</span>
                            </div>
                            <h2 className="mt-2 text-3xl font-bold uppercase leading-none tracking-wider text-slate-900">
                                {product.name}
                            </h2>
                        </div>

                        <div className="mt-2 flex items-center gap-8">
                            <div className="flex flex-col justify-end">
                                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Факт залишок</div>
                                <div
                                    className={cn(
                                        'flex items-baseline gap-1 text-3xl font-black leading-none font-mono',
                                        Number(product.computed?.totalStock || 0) <= 0 ? 'text-red-500' : 'text-emerald-500'
                                    )}
                                >
                                    {formatStock(Number(product.computed?.totalStock || 0))}
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{unit}</span>
                                </div>
                                {packagingEnabled && kgUnit ? (
                                    <div className="mt-1 text-[12px] font-bold uppercase tracking-wider text-slate-500">
                                        {packLabel(totalStockPacks)}
                                    </div>
                                ) : null}
                            </div>
                            <div className="hidden h-10 w-px bg-slate-200 md:block" />
                            <div className="flex flex-col justify-end">
                                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Потреба (ціль)</div>
                                <div className="flex items-baseline gap-1 text-3xl font-black leading-none font-mono text-blue-500">
                                    {formatMetric(Number(product.computed?.totalRecommended || 0))}
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300">{unit}</span>
                                </div>
                                {packagingEnabled && kgUnit ? (
                                    <div className="mt-1 text-[12px] font-bold uppercase tracking-wider text-blue-400">
                                        {packLabel(totalNeedPacks)}
                                    </div>
                                ) : null}
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
                        {stores.map((store: any, index: number) => {
                            const isOos = Number(store.computed?.stock || 0) <= 0;

                            return (
                                <div
                                    key={store.storeName || index}
                                    className={cn(
                                        'relative flex flex-col gap-2 overflow-hidden rounded-xl p-4 transition-all duration-200',
                                        isOos
                                            ? 'border border-red-200 bg-red-50 hover:border-red-300'
                                            : 'border border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm'
                                    )}
                                >
                                    <div className="pointer-events-none absolute left-0 top-0 h-0.5 w-full bg-gradient-to-r from-transparent via-blue-200 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                                    <div
                                        className="truncate text-center font-[family-name:var(--font-chakra)] text-sm font-semibold uppercase tracking-wider text-slate-900"
                                        title={store.storeName}
                                    >
                                        {String(store.storeName || '').replace('Магазин ', '')}
                                    </div>

                                    <div className="mt-2 grid grid-cols-3 gap-2">
                                        <div className="flex flex-col items-center">
                                            <span className="mb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 font-[family-name:var(--font-jetbrains)]">Факт</span>
                                            <span className={cn('text-lg font-bold leading-none', isOos ? 'text-red-500' : 'text-emerald-500')}>
                                                {formatStock(Number(store.computed?.stock || 0))}
                                            </span>
                                            {store.packaging_enabled && kgUnit ? (
                                                <span className="mt-1 text-[11px] font-bold text-slate-500">{packLabel(store.stock_now_packs_est)}</span>
                                            ) : null}
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="mb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 font-[family-name:var(--font-jetbrains)]">Мін</span>
                                            <span className="text-lg font-bold leading-none text-slate-600">
                                                {formatMetric(Number(store.computed?.minStock || 0))}
                                            </span>
                                            {store.packaging_enabled && kgUnit ? (
                                                <span className="mt-1 text-[11px] font-bold text-slate-500">{packLabel(store.min_stock_packs_est)}</span>
                                            ) : null}
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="mb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 font-[family-name:var(--font-jetbrains)]">Сер</span>
                                            <span className="text-lg font-bold leading-none text-blue-500">
                                                {Number(store.computed?.avg || 0).toFixed(1)}
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
