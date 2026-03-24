'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import { Percent, TrendingDown } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function BakeryAdminStores() {
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
    const periodQuery = `start_date=${startDate}&end_date=${endDate}`;

    const { data: apiData, isLoading } = useSWR(`/api/bakery/analytics?${periodQuery}`, fetcher);

    const network = apiData?.network || {};
    const ranking = apiData?.ranking || {};
    const allStores = ranking.all_stores || [];

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center text-gray-500">Завантаження аналітики по магазинам...</div>;
    }

    return (
        <div className="animate-in fade-in duration-300">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Аналітика по Магазинах</h1>
                <div className="text-sm text-gray-500">
                    Дані за період: {startDate} — {endDate}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Global Discount Info */}
                <div className="bg-[#2A3F54] text-white rounded shadow-sm border border-[#2A3F54] p-6 relative overflow-hidden flex flex-col justify-center">
                    <div className="absolute -right-4 -bottom-4 opacity-10">
                        <Percent size={120} />
                    </div>
                    <h2 className="text-[20px] font-bold mb-2 flex items-center gap-2"><TrendingDown size={24} /> Глобальна Каннібалізація</h2>
                    <div className="text-[50px] font-bold leading-none mb-4">{network.cannibalization_pct ?? network.cannibalization_rate ?? 0}%</div>
                    <p className="m-0 text-white/90">
                        Частка покупок зі знижкою у загальних продажах. Значення вище 25% свідчить, що покупці навмисно чекають знижок (маржа падає).
                    </p>
                </div>

                {/* Most dependent on discount */}
                <div className="bg-white rounded shadow-sm border border-gray-100 lg:col-span-2">
                    <div className="p-4 border-b border-gray-100">
                        <h2 className="text-base font-semibold text-gray-700">Аномалії дисконту (Cannibalization &gt; 25%)</h2>
                    </div>
                    <div className="p-4">
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {allStores
                                .filter((s: any) => s.cannibalization_pct > 25)
                                .sort((a: any, b: any) => b.cannibalization_pct - a.cannibalization_pct)
                                .slice(0, 10)
                                .map((s: any, idx: number) => (
                                    <li key={idx} className="flex justify-between items-center p-3 border border-gray-100 rounded-md bg-gray-50">
                                        <div>
                                            <p className="m-0 font-medium text-gray-700">{s.store_name}</p>
                                            <small className="text-gray-500">{s.total_sold} всього / {s.disc_sold} дисконт</small>
                                        </div>
                                        <div className="text-right">
                                            <span className="inline-block px-2 py-1 bg-red-500 text-white rounded text-xs font-bold shadow-sm">
                                                {s.cannibalization_pct.toFixed(1)}%
                                            </span>
                                        </div>
                                    </li>
                                ))}
                        </ul>
                        {allStores.filter((s: any) => s.cannibalization_pct > 25).length === 0 && (
                            <div className="text-center py-4 text-gray-500">Немає магазинів з критичним рівнем каннібалізації.</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Store Rankings Full Table */}
            <div className="bg-white rounded shadow-sm border border-gray-100">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-gray-700">Детальний Ренкінг Магазинів</h2>
                </div>
                <div className="p-0 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 text-gray-600 bg-gray-50">
                                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-xs">Магазин</th>
                                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-xs text-right">Фреш (шт)</th>
                                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-xs text-right">Дисконт (шт)</th>
                                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-xs text-right">Каннібалізація</th>
                                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-xs text-right">Разом продано</th>
                                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-xs text-right">Списання (шт)</th>
                                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-xs text-right">Втрати (%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(allStores.length === 0) && (
                                <tr>
                                    <td colSpan={7} className="text-center py-8 text-gray-500">Дані відсутні або завантажуються...</td>
                                </tr>
                            )}
                            {allStores
                                .sort((a: any, b: any) => (b.total_revenue || 0) - (a.total_revenue || 0))
                                .map((store: any, idx: number) => {
                                    const rate = store.cannibalization_pct ?? store.cannibalization_rate ?? 0;
                                    const wastePct = store.waste_pct ?? 0;

                                    const isCritical = rate > 30;
                                    const isWarning = rate > 20 && rate <= 30;

                                    const isWasteCritical = wastePct > 15;
                                    const isWasteWarning = wastePct > 10 && wastePct <= 15;

                                    return (
                                        <tr key={idx} className={cn(
                                            "border-b border-gray-100 hover:bg-blue-50/50 transition-colors",
                                            idx % 2 !== 0 ? "bg-gray-50/50" : ""
                                        )}>
                                            <td className="py-3 px-4 font-medium text-gray-700">{store.store_name}</td>
                                            <td className="py-3 px-4 text-right text-emerald-600 font-semibold">{store.fresh_sold?.toLocaleString('uk-UA')}</td>
                                            <td className="py-3 px-4 text-right text-emerald-600/70">{store.disc_sold?.toLocaleString('uk-UA')}</td>
                                            <td className="py-3 px-4 text-right">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded text-[11px] font-bold",
                                                    isCritical ? "bg-red-100 text-red-600" :
                                                        isWarning ? "bg-yellow-100 text-yellow-600" :
                                                            "bg-emerald-100 text-emerald-600"
                                                )}>
                                                    {rate.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-right font-bold text-gray-700">{store.total_sold?.toLocaleString('uk-UA')}</td>
                                            <td className="py-3 px-4 text-right text-red-500">{store.total_waste?.toLocaleString('uk-UA')}</td>
                                            <td className="py-3 px-4 text-right">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded text-[11px] font-bold shadow-sm",
                                                    isWasteCritical ? "bg-red-500 text-white" :
                                                        isWasteWarning ? "bg-amber-500 text-white" :
                                                            "bg-gray-100 text-gray-600"
                                                )}>
                                                    {wastePct.toFixed(1)}%
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
