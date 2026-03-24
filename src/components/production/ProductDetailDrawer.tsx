'use client';

import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
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

    const { stores = [] } = product;
    const unit = String(product.unit || 'шт').trim() || 'шт';
    const kgUnit = isKgUnit(unit);
    const packagingEnabled = Boolean(stores.some((store: any) => store.packaging_enabled));

    const formatStock = (value: number) => (kgUnit ? value.toFixed(2) : value.toFixed(0));
    const formatMetric = (value: number) => (kgUnit ? value.toFixed(1) : value.toFixed(0));
    const totalStockPacks = stores.reduce((sum: number, store: any) => sum + Number(store.stock_now_packs_est || 0), 0);
    const totalNeedPacks = stores.reduce((sum: number, store: any) => sum + Number(store.need_net_packs_est || 0), 0);

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
            <div className="w-full max-w-[1400px] h-auto max-h-[90vh] rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-2xl flex flex-col transform transition-transform animate-in zoom-in-95 duration-200">
                <div className="flex items-start justify-between p-5 px-8 border-b border-slate-200 shrink-0">
                    <div className="flex items-center gap-12">
                        <div className="flex flex-col justify-center">
                            <div className="text-[10px] text-blue-500 font-bold uppercase tracking-[0.2em] flex items-center gap-2">
                                <span>Деталі товару</span>
                            </div>
                            <h2 className="text-3xl font-bold text-slate-900 uppercase tracking-wider leading-none mt-2">
                                {product.name}
                            </h2>
                        </div>

                        <div className="flex items-center gap-8 mt-2">
                            <div className="flex flex-col justify-end">
                                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-[0.2em] mb-2">Факт залишок</div>
                                <div
                                    className={cn(
                                        'text-3xl font-mono font-black leading-none flex items-baseline gap-1',
                                        product.computed.totalUrgentDeficit > 0 ? 'text-red-500' : 'text-emerald-500'
                                    )}
                                >
                                    {formatStock(product.computed.totalStock)}
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{unit}</span>
                                </div>
                                {packagingEnabled && kgUnit ? (
                                    <div className="mt-1 text-[12px] font-bold text-slate-500 uppercase tracking-wider">
                                        {packLabel(totalStockPacks)}
                                    </div>
                                ) : null}
                            </div>
                            <div className="w-px h-10 bg-slate-200 hidden md:block" />
                            <div className="flex flex-col justify-end">
                                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-[0.2em] mb-2">Треба (ціль)</div>
                                <div className="text-3xl font-mono font-black text-blue-500 leading-none flex items-baseline gap-1">
                                    {formatMetric(product.computed.totalRecommended)}
                                    <span className="text-[11px] font-bold text-blue-300 uppercase tracking-wider">{unit}</span>
                                </div>
                                {packagingEnabled && kgUnit ? (
                                    <div className="mt-1 text-[12px] font-bold text-blue-400 uppercase tracking-wider">
                                        {packLabel(totalNeedPacks)}
                                    </div>
                                ) : null}
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

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {stores.map((store: any, index: number) => {
                            const isLowStock = store.computed.stock < store.computed.minStock;

                            return (
                                <div
                                    key={store.storeName || index}
                                    className={cn(
                                        'rounded-xl p-4 flex flex-col gap-2 transition-all duration-200 relative overflow-hidden group',
                                        isLowStock
                                            ? 'bg-red-50 border border-red-200 hover:border-red-300'
                                            : 'bg-white border border-slate-200 hover:border-blue-200 hover:shadow-sm'
                                    )}
                                >
                                    <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-blue-200 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                                    <div
                                        className="text-sm font-semibold text-slate-900 uppercase tracking-wider truncate text-center font-[family-name:var(--font-chakra)]"
                                        title={store.storeName}
                                    >
                                        {String(store.storeName || '').replace('Магазин ', '')}
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 mt-2">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold tracking-[0.2em] text-slate-400 mb-1 uppercase font-[family-name:var(--font-jetbrains)]">Факт</span>
                                            <span className={cn('text-lg font-bold leading-none', isLowStock ? 'text-red-500' : 'text-emerald-500')}>
                                                {formatStock(store.computed.stock)}
                                            </span>
                                            {store.packaging_enabled && kgUnit ? (
                                                <span className="text-[11px] font-bold text-slate-500 mt-1">{packLabel(store.stock_now_packs_est)}</span>
                                            ) : null}
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold tracking-[0.2em] text-slate-400 mb-1 uppercase font-[family-name:var(--font-jetbrains)]">Мін</span>
                                            <span className="text-lg font-bold leading-none text-slate-600">
                                                {formatMetric(store.computed.minStock)}
                                            </span>
                                            {store.packaging_enabled && kgUnit ? (
                                                <span className="text-[11px] font-bold text-slate-500 mt-1">{packLabel(store.min_stock_packs_est)}</span>
                                            ) : null}
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold tracking-[0.2em] text-slate-400 mb-1 uppercase font-[family-name:var(--font-jetbrains)]">Сер</span>
                                            <span className="text-lg font-bold leading-none text-blue-500">
                                                {store.computed.avg.toFixed(1)}
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
