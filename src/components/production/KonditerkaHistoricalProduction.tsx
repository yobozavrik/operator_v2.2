import React, { useState } from 'react';
import useSWR from 'swr';
import { Loader2, Search, ArrowUpDown, Calendar, Package, BookOpen } from 'lucide-react';
import { authedFetcher } from '@/lib/authed-fetcher';

interface CatalogProduct {
    product_id: number;
    product_name: string;
    unit?: 'шт' | 'кг';
    category_name?: string;
    total_qty_180d?: number;
    last_manufacture_at?: string | null;
}

interface ApiResponse {
    rows: CatalogProduct[];
    meta: {
        products_count: number;
        last_update: string;
    };
}

export const KonditerkaHistoricalProduction = () => {
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState('product_name');
    const [order, setOrder] = useState('asc');

    const { data, isLoading } = useSWR<ApiResponse>(
        `/api/konditerka/production-180d?search=${encodeURIComponent(search)}&sort=${sort}&order=${order}`,
        authedFetcher
    );

    const toggleSort = (field: string) => {
        if (sort === field) {
            setOrder(order === 'asc' ? 'desc' : 'asc');
        } else {
            setSort(field);
            setOrder(field === 'product_name' ? 'asc' : 'desc');
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 text-slate-900 p-6 overflow-hidden">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-orange-50 border border-orange-100 rounded-2xl">
                        <BookOpen className="text-orange-500" size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black uppercase tracking-wider text-slate-900">Каталог продукції</h2>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Фактичні назви та одиниці виміру з Poster</p>
                    </div>
                </div>

                <div className="flex items-center gap-4 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-full md:w-96">
                    <Search className="ml-3 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Пошук товару..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-transparent border-none focus:ring-0 text-sm w-full py-2 placeholder:text-slate-300"
                    />
                </div>
            </div>

            <div className="flex-1 bg-white rounded-3xl border border-slate-200 overflow-hidden flex flex-col shadow-sm">
                <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">
                    <button type="button" className="col-span-5 flex items-center gap-2 cursor-pointer hover:text-slate-900 transition-colors text-left" onClick={() => toggleSort('product_name')}>
                        Товар {sort === 'product_name' && <ArrowUpDown size={10} />}
                    </button>
                    <button type="button" className="col-span-2 text-center flex items-center justify-center gap-2 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('category_name')}>
                        Категорія {sort === 'category_name' && <ArrowUpDown size={10} />}
                    </button>
                    <button type="button" className="col-span-2 text-center flex items-center justify-center gap-2 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('unit')}>
                        Од. виміру {sort === 'unit' && <ArrowUpDown size={10} />}
                    </button>
                    <button type="button" className="col-span-3 text-right flex items-center justify-end gap-2 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('last_manufacture_at')}>
                        Останнє вир-во {sort === 'last_manufacture_at' && <ArrowUpDown size={10} />}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {isLoading ? (
                        <div className="h-full flex flex-col items-center justify-center gap-4 opacity-40">
                            <Loader2 className="animate-spin text-orange-500" size={40} />
                            <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Оновлення каталогу...</span>
                        </div>
                    ) : !data?.rows?.length ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-20">
                            <Package size={64} className="mb-4 text-slate-400" />
                            <span className="text-sm font-black uppercase tracking-widest text-slate-400">Даних не знайдено</span>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {data.rows.map((row) => (
                                <div key={row.product_id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-slate-50 transition-colors group">
                                    <div className="col-span-5">
                                        <div className="text-sm font-bold text-slate-900 group-hover:text-orange-600 transition-colors">{row.product_name}</div>
                                        <div className="text-[9px] text-slate-400 uppercase font-black mt-1">ID: {row.product_id}</div>
                                    </div>
                                    <div className="col-span-2 text-center">
                                        <div className="text-sm font-semibold text-slate-700">
                                            {row.category_name || '-'}
                                        </div>
                                    </div>
                                    <div className="col-span-2 text-center">
                                        <div className="inline-flex items-center justify-center rounded-lg border border-orange-100 bg-orange-50 px-3 py-1 text-sm font-black uppercase text-orange-600">
                                            {row.unit || 'шт'}
                                        </div>
                                    </div>
                                    <div className="col-span-3 text-right">
                                        <div className="flex items-center justify-end gap-2 text-xs font-bold text-slate-600">
                                            <Calendar size={12} className="text-slate-300" />
                                            {row.last_manufacture_at ? new Date(row.last_manufacture_at).toLocaleDateString() : '-'}
                                        </div>
                                        <div className="text-[9px] text-slate-400 font-black uppercase mt-1">
                                            180д: {Number(row.total_qty_180d || 0).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <div>Всього позицій: <span className="text-slate-900 font-bold">{data?.meta?.products_count || 0}</span></div>
                    {data?.meta?.last_update && (
                        <div>Оновлено: <span className="text-slate-700">{new Date(data.meta.last_update).toLocaleString()}</span></div>
                    )}
                </div>
            </div>
        </div>
    );
};
