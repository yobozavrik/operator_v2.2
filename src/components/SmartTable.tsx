'use client';

import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ProductionTask, SKUCategory, PriorityKey, SupabaseDeficitRow } from '@/types/bi';
import { cn } from '@/lib/utils';
import { AlertCircle, Clock, CheckCircle2, MoreVertical } from 'lucide-react';

const Sparkline = ({ data }: { data: number[] }) => {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    return (
        <div className="flex items-end gap-0.5 h-6 w-16">
            {data.map((val, i) => (
                <div
                    key={i}
                    className="w-1.5 bg-brand-primary/40 rounded-t-sm"
                    style={{ height: `${((val - min) / range) * 100}%`, minHeight: '2px' }}
                />
            ))}
        </div>
    );
};

export const SmartTable = ({ queue }: { queue: ProductionTask[] }) => {
    return (
        <div className="w-full">
            {/* Desktop View (Table) */}
            <div className="hidden lg:block glass-card rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/5 text-[10px] uppercase tracking-widest font-bold text-slate-400">
                                <th className="px-6 py-4">Товар / Категория</th>
                                <th className="px-6 py-4">Остаток (Маг)</th>
                                <th className="px-6 py-4">Прогноз (AI)</th>
                                <th className="px-6 py-4">Рекомендовано</th>
                                <th className="px-6 py-4">Приоритет</th>
                                <th className="px-6 py-4 text-right">Действие</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {queue.map((item) => (
                                <tr
                                    key={item.id}
                                    className="group hover:bg-white/5 transition-colors duration-150"
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-white group-hover:text-brand-primary transition-colors">
                                                {item.name}
                                            </span>
                                            <span className="text-[10px] text-slate-500 font-medium">
                                                {item.category}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "text-sm font-bold",
                                                item.totalStockKg < item.minStockThresholdKg ? "text-status-high" : "text-white"
                                            )}>
                                                {item.totalStockKg} кг
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-medium text-slate-300">{item.dailyForecastKg} кг</span>
                                            <Sparkline data={item.salesTrendKg} />
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-black text-brand-primary">
                                                {item.recommendedQtyKg} кг
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className={cn(
                                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tight",
                                            item.priority === 'critical' && "bg-status-high/10 text-status-high border border-status-high/20",
                                            item.priority === 'high' && "bg-status-medium/10 text-status-medium border border-status-medium/20",
                                            item.priority === 'normal' && "bg-status-low/10 text-status-low border border-status-low/20",
                                        )}>
                                            {item.priority === 'critical' && <AlertCircle size={10} />}
                                            {item.priority === 'high' && <Clock size={10} />}
                                            {item.priority === 'normal' && <CheckCircle2 size={10} />}
                                            {item.priorityReason}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button className="px-3 py-1.5 bg-brand-primary text-white text-[10px] font-bold rounded-lg hover:shadow-lg hover:shadow-brand-primary/30 transition-all opacity-0 group-hover:opacity-100 uppercase tracking-wider">
                                                В работу
                                            </button>
                                            <button className="p-1.5 text-slate-500 hover:text-white transition-colors">
                                                <MoreVertical size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Mobile View (Cards) */}
            <div className="lg:hidden space-y-4">
                {queue.map((item) => (
                    <div key={item.id} className="glass-card p-5 rounded-2xl border border-white/5 space-y-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-white text-base leading-tight">{item.name}</h3>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{item.category}</p>
                            </div>
                            <div className={cn(
                                "px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter",
                                item.priority === 'critical' ? "bg-status-high text-white animate-pulse" : "bg-white/10 text-slate-400"
                            )}>
                                {item.priority === 'critical' ? 'КРИТИЧНО' : item.priorityReason}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Сток сейчас</p>
                                <p className={cn("text-lg font-black", item.totalStockKg < item.minStockThresholdKg ? "text-status-high" : "text-white")}>
                                    {item.totalStockKg} <span className="text-xs uppercase">кг</span>
                                </p>
                            </div>
                            <div className="bg-brand-primary/5 p-3 rounded-xl border border-brand-primary/10">
                                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-1 text-brand-primary/80">План (AI)</p>
                                <p className="text-lg font-black text-brand-primary">
                                    {item.recommendedQtyKg} <span className="text-xs uppercase">кг</span>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/5">
                            <div className="flex flex-col gap-1">
                                <p className="text-[8px] font-bold text-slate-600 uppercase">Тренд 24ч</p>
                                <Sparkline data={item.salesTrendKg} />
                            </div>
                            <button className="flex-1 py-3 bg-brand-primary text-white text-xs font-black rounded-xl uppercase tracking-widest shadow-lg shadow-brand-primary/20 active:scale-95 transition-all">
                                В производство
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
