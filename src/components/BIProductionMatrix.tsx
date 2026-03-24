'use client';

import React from 'react';
import { ProductionTask } from '@/types/bi';
import { cn } from '@/lib/utils';
import { TrendingUp, Edit2 } from 'lucide-react';

export const BIProductionMatrix = ({ queue }: { queue: ProductionTask[] }) => {
    return (
        <div className="bi-panel rounded-xl overflow-hidden flex flex-col h-full border-t border-brand-primary/20" role="region" aria-label="Операційна матриця виробництва">
            <div className="px-4 py-3 border-b border-surface-700 bg-surface-900/50 flex justify-between items-center">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Production Matrix (Operational)</h3>
                <div className="flex gap-2" aria-live="polite">
                    <div className="w-2 h-2 rounded-full bg-status-high animate-ping" />
                    <span className="text-[10px] font-black text-status-high uppercase">Real-time update</span>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-surface-900/80 text-[10px] uppercase font-black text-slate-600 tracking-tighter">
                            <th className="px-4 py-3 border-b border-surface-700">SKU Identifier</th>
                            <th className="px-4 py-3 border-b border-surface-700">Stock (kg)</th>
                            <th className="px-4 py-3 border-b border-surface-700">24h Sales Trend</th>
                            <th className="px-4 py-3 border-b border-surface-700">Deficit</th>
                            <th className="px-4 py-3 border-b border-surface-700 text-right">Plan Adjust (kg)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-700/50">
                        {queue.slice(0, 15).map((item, i) => {
                            const deficitPercent = item.deficitPercent || 0;

                            return (
                                <tr key={item.id} className={cn(
                                    "hover:bg-brand-primary/5 transition-colors group",
                                    i % 2 === 0 ? "bg-surface-800" : "bg-surface-800/40"
                                )}>
                                    <td className="px-4 py-2">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-white group-hover:text-brand-primary transition-colors uppercase">{item.name}</span>
                                            <span className="text-[9px] font-bold text-slate-400">{item.category}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 font-mono text-xs text-slate-300">
                                        {item.totalStockKg.toFixed(1)} <span className="text-[10px] opacity-30">кг</span>
                                    </td>
                                    <td className="px-4 py-2">
                                        <div className="flex items-center gap-2">
                                            <TrendingUp size={12} className="text-[#58A6FF]" />
                                            <span className="text-xs font-mono font-black text-slate-300">
                                                {item.dailyForecastKg.toFixed(1)}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2">
                                        <div className={cn(
                                            "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black font-mono border",
                                            deficitPercent > 60 ? "bg-[#F85149]/10 text-[#F85149] border-[#F85149]/30" :
                                                deficitPercent > 30 ? "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30" :
                                                    "bg-[#3FB950]/10 text-[#3FB950] border-[#3FB950]/30"
                                        )}>
                                            {deficitPercent.toFixed(0)}%
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <div className="inline-flex items-center gap-2 bg-surface-900 border border-surface-700 rounded px-2 py-1 group-hover:border-brand-primary transition-colors">
                                            <span className="w-12 text-right font-mono text-xs font-black text-brand-primary">
                                                +{item.recommendedQtyKg}
                                            </span>
                                            <Edit2 size={10} className="text-slate-600" />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
