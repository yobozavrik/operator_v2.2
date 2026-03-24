'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Package, AlertTriangle, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function BakeryAdminCatalog() {
    const [startDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 14);
        return d.toISOString().split('T')[0];
    });
    const [endDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    });

    const [selectedSku, setSelectedSku] = useState<{ id: string, name: string } | null>(null);

    const { data: catalogData, isLoading: catalogLoading } = useSWR(`/api/bakery/catalog?start_date=${startDate}&end_date=${endDate}`, fetcher);
    const { data: storesData, isLoading: storesLoading } = useSWR(selectedSku ? `/api/bakery/catalog/stores?sku_id=${selectedSku.id}&start_date=${startDate}&end_date=${endDate}` : null, fetcher);

    return (
        <div className="animate-in fade-in duration-300">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Каталог Товарів (SKU Metrics)</h1>
                <div className="text-sm text-gray-500">
                    Дані за період: {startDate} — {endDate}
                </div>
            </div>

            {catalogLoading ? (
                <div className="bg-white rounded shadow-sm border border-gray-100 p-12 flex justify-center">
                    <Loader2 className="animate-spin text-blue-500 size-8" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                    {(catalogData?.cards || []).length === 0 ? (
                        <div className="col-span-full text-center p-12 text-gray-500 bg-white rounded shadow-sm border border-gray-100">
                            Немає даних про товари за обраний період
                        </div>
                    ) : (
                        (catalogData?.cards || []).map((sku: any, idx: number) => {
                            const wastePct = sku.waste_pct || 0;
                            const isWasteHigh = wastePct > 15;
                            return (
                                <div
                                    key={idx}
                                    onClick={() => setSelectedSku({ id: sku.sku_id, name: sku.sku_name })}
                                    className="bg-white rounded shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer flex flex-col h-full group"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="p-2 bg-blue-50 rounded-lg text-blue-500 group-hover:bg-blue-100 transition-colors">
                                            <Package size={20} />
                                        </div>
                                        {isWasteHigh && (
                                            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-50 px-2 py-1 rounded-md border border-red-100">
                                                <AlertTriangle size={12} /> High Waste
                                            </div>
                                        )}
                                    </div>
                                    <h4 className="font-bold text-gray-800 mb-1 line-clamp-2 md:min-h-[48px] leading-tight group-hover:text-blue-600 transition-colors">{sku.sku_name}</h4>
                                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-4">SKU ID: {sku.sku_id}</p>

                                    <div className="grid grid-cols-2 gap-y-4 gap-x-2 mt-auto pt-4 border-t border-gray-100">
                                        <div>
                                            <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Продажі</div>
                                            <div className="font-medium text-emerald-600 text-lg leading-none">{sku.total_sold?.toLocaleString('uk-UA')} <span className="text-[10px] text-gray-400">шт</span></div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Середнє / день</div>
                                            <div className="font-medium text-gray-700 text-lg leading-none">{sku.avg_daily_sold} <span className="text-[10px] text-gray-400">шт</span></div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Списання</div>
                                            <div className={cn("font-bold text-lg leading-none", isWasteHigh ? "text-red-500" : "text-amber-500")}>
                                                {sku.waste_pct}%
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Дисконт</div>
                                            <div className="font-bold text-blue-500 text-lg leading-none">{sku.disc_pct}%</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* MODAL / DRAWER FOR SKU STORES */}
            {selectedSku && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity">
                    <div className="w-full max-w-3xl bg-white h-full overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800 mb-1 pr-8">{selectedSku.name}</h3>
                                <p className="text-xs text-gray-500 uppercase tracking-widest">Детальна розбивка по магазинах</p>
                            </div>
                            <button
                                onClick={() => setSelectedSku(null)}
                                className="p-2 hover:bg-gray-200 rounded-full text-gray-500 hover:text-gray-800 transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-6 custom-scrollbar bg-white">
                            {storesLoading ? (
                                <div className="flex h-[300px] items-center justify-center">
                                    <Loader2 className="animate-spin text-blue-500 size-8" />
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {(storesData?.stores || []).length === 0 ? (
                                        <div className="text-center p-12 text-gray-500 border border-dashed border-gray-200 rounded-xl bg-gray-50">
                                            Немає даних про продажі по магазинах для цього товару
                                        </div>
                                    ) : (
                                        <table className="w-full text-left text-sm border-collapse">
                                            <thead>
                                                <tr className="border-b border-gray-200">
                                                    <th className="py-3 text-gray-500 font-semibold uppercase text-xs">Магазин</th>
                                                    <th className="py-3 text-right text-emerald-600 font-semibold uppercase text-xs">Фреш (шт)</th>
                                                    <th className="py-3 text-right text-blue-500 font-semibold uppercase text-xs">Дисконт (шт)</th>
                                                    <th className="py-3 text-right text-red-500 font-semibold uppercase text-xs">Списання</th>
                                                    <th className="py-3 text-right text-gray-600 font-semibold uppercase text-xs">Загалом</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {storesData.stores.sort((a: any, b: any) => b.total_sold - a.total_sold).map((store: any, idx: number) => {
                                                    const wastePct = store.waste_pct || 0;
                                                    const isWasteHigh = wastePct > 15;
                                                    return (
                                                        <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                                            <td className="py-3 font-medium text-gray-700">{store.store_name}</td>
                                                            <td className="py-3 text-right font-medium text-emerald-600">{store.fresh_sold}</td>
                                                            <td className="py-3 text-right font-medium text-blue-500">{store.disc_sold}</td>
                                                            <td className="py-3 text-right">
                                                                <span className={cn("px-2 py-0.5 rounded text-xs font-bold", isWasteHigh ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-500")}>
                                                                    {wastePct}%
                                                                </span>
                                                            </td>
                                                            <td className="py-3 text-right font-bold text-gray-800">{store.total_sold} <span className="text-[10px] text-gray-400 font-normal">шт</span></td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}

                                    {storesData?.stores && storesData.stores.length > 0 && (
                                        <div className="mt-8 border-t border-gray-100 pt-6">
                                            <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Візуалізація продажів (Топ-10 магазинів)</h4>
                                            <div className="h-[250px] w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={storesData.stores.sort((a: any, b: any) => b.total_sold - a.total_sold).slice(0, 10)} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEEEEE" />
                                                        <XAxis dataKey="store_name" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} interval={0} angle={-30} textAnchor="end" />
                                                        <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                                                        <Tooltip cursor={{ fill: '#F5F7FA' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                                        <Bar dataKey="total_sold" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
