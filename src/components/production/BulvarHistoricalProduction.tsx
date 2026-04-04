import React, { useState } from 'react';
import useSWR from 'swr';
import { Loader2, Search, ArrowUpDown, Calendar, Package, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authedFetcher } from '@/lib/authed-fetcher';

interface HistoricalProduct {
    product_id: number;
    product_name: string;
    total_qty_180d: number;
    prod_days: number;
    avg_qty_per_prod_day: number;
    last_manufacture_at: string;
}

interface ApiResponse {
    rows: HistoricalProduct[];
    meta: {
        products_count: number;
        last_update: string;
    };
}

export const BulvarHistoricalProduction = () => {
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState('total_qty_180d');
    const [order, setOrder] = useState('desc');

    const { data, isLoading } = useSWR<ApiResponse>(
        `/api/bulvar/production-180d?search=${encodeURIComponent(search)}&sort=${sort}&order=${order}`,
        authedFetcher
    );

    const toggleSort = (field: string) => {
        if (sort === field) {
            setOrder(order === 'asc' ? 'desc' : 'asc');
        } else {
            setSort(field);
            setOrder('desc');
        }
    };

    return (
        <div className="flex flex-col h-full bg-bg-primary text-text-primary p-6 overflow-hidden">
            {/* Header / Stats */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-accent-primary/10 border border-accent-primary/20 rounded-2xl">
                        <TrendingUp className="text-accent-primary" size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black uppercase tracking-wider text-text-primary">Виробництво 180 днів</h2>
                        <p className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">Аналітика цеху Автовокзал</p>
                    </div>
                </div>

                <div className="flex items-center gap-4 bg-panel-bg p-1.5 rounded-2xl border border-panel-border shadow-[var(--panel-shadow)] w-full md:w-96">
                    <Search className="ml-3 text-text-secondary" size={18} />
                    <input
                        type="text"
                        placeholder="Пошук товару..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-transparent border-none focus:ring-0 text-sm w-full py-2 placeholder:text-text-muted text-text-primary"
                    />
                </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 bg-panel-bg rounded-3xl border border-panel-border overflow-hidden flex flex-col shadow-[var(--panel-shadow)]">
                <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-bg-primary text-[10px] font-black uppercase tracking-widest text-text-secondary border-b border-panel-border">
                    <div className="col-span-5 flex items-center gap-2 cursor-pointer hover:text-text-primary transition-colors" onClick={() => toggleSort('product_name')}>
                        Товар {sort === 'product_name' && <ArrowUpDown size={10} />}
                    </div>
                    <div className="col-span-2 text-center flex items-center justify-center gap-2 cursor-pointer hover:text-text-primary transition-colors" onClick={() => toggleSort('total_qty_180d')}>
                        Загальний об'єм {sort === 'total_qty_180d' && <ArrowUpDown size={10} />}
                    </div>
                    <div className="col-span-2 text-center flex items-center justify-center gap-2 cursor-pointer hover:text-text-primary transition-colors" onClick={() => toggleSort('prod_days')}>
                        Днів вир-ва {sort === 'prod_days' && <ArrowUpDown size={10} />}
                    </div>
                    <div className="col-span-3 text-right flex items-center justify-end gap-2 cursor-pointer hover:text-text-primary transition-colors" onClick={() => toggleSort('last_manufacture_at')}>
                        Остання дата {sort === 'last_manufacture_at' && <ArrowUpDown size={10} />}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {isLoading ? (
                        <div className="h-full flex flex-col items-center justify-center gap-4 opacity-40">
                            <Loader2 className="animate-spin text-accent-primary" size={40} />
                            <span className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary">Обробка 180-денної історії...</span>
                        </div>
                    ) : !data?.rows?.length ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-20">
                            <Package size={64} className="mb-4 text-text-secondary" />
                            <span className="text-sm font-black uppercase tracking-widest text-text-secondary">Даних не знайдено</span>
                        </div>
                    ) : (
                        <div className="divide-y divide-panel-border">
                            {data.rows.map((row) => (
                                <div key={row.product_id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-bg-primary transition-colors group">
                                    <div className="col-span-5">
                                        <div className="text-sm font-bold text-text-primary group-hover:text-accent-primary transition-colors">{row.product_name}</div>
                                        <div className="text-[9px] text-text-secondary uppercase font-black mt-1">ID: {row.product_id}</div>
                                    </div>
                                    <div className="col-span-2 text-center">
                                        <div className="text-lg font-mono font-black text-accent-primary">
                                            {Number(row.total_qty_180d).toLocaleString()}
                                        </div>
                                        <div className="text-[9px] text-text-secondary font-black uppercase mt-0.5">Всього шт/кг</div>
                                    </div>
                                    <div className="col-span-2 text-center">
                                        <div className="text-sm font-mono font-bold text-text-primary">
                                            {row.prod_days}
                                        </div>
                                        <div className="text-[9px] text-text-secondary font-black uppercase mt-0.5">Виходів</div>
                                    </div>
                                    <div className="col-span-3 text-right">
                                        <div className="flex items-center justify-end gap-2 text-xs font-bold text-text-primary">
                                            <Calendar size={12} className="text-text-secondary" />
                                            {row.last_manufacture_at ? new Date(row.last_manufacture_at).toLocaleDateString() : '-'}
                                        </div>
                                        <div className="text-[9px] text-text-secondary font-black uppercase mt-1">
                                            Сер. {Number(row.avg_qty_per_prod_day).toFixed(1)} / варку
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Info */}
                <div className="px-6 py-4 bg-bg-primary border-t border-panel-border flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-text-secondary">
                    <div>Всього позицій: <span className="text-text-primary font-bold">{data?.meta?.products_count || 0}</span></div>
                    {data?.meta?.last_update && (
                        <div>Оновлено: <span className="text-text-primary">{new Date(data.meta.last_update).toLocaleString()}</span></div>
                    )}
                </div>
            </div>
        </div>
    );
};
