'use client';

import React from 'react';
import { ProductionTask } from '@/types/bi';
import { BarChart3, AlertTriangle, TrendingDown, Store as StoreIcon } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const SeniorAnalytics = ({ queue }: { queue: ProductionTask[] }) => {
    const { selectedStore } = useStore();

    // 1. Calculate deficit by category
    const categories = Array.from(new Set(queue.map(t => t.category)));
    const deficitByCategory = categories.map(cat => {
        const totalDeficit = queue
            .filter(t => t.category === cat)
            .reduce((acc, t) => acc + t.recommendedQtyKg, 0);
        return { name: cat, value: Math.round(totalDeficit) };
    }).sort((a, b) => b.value - a.value).slice(0, 6);

    const maxDeficit = Math.max(...deficitByCategory.map(d => d.value)) || 1;

    // 2. Mock "Target Store" data
    const targetStore = selectedStore === 'Усі' ? 'Магазин "Садгора"' : selectedStore;
    const storeEmpty = queue.filter(t =>
        t.stores.some(s => s.storeName === targetStore && s.currentStock === 0)
    ).length;

    return (
        <div className="space-y-6" role="complementary" aria-label="Аналітична панель">
            {/* Top Deficit Bar Chart */}
            <div className="bi-panel p-6 rounded-2xl border border-white/5 bg-[#1e1e1e]">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-2 bg-[#58A6FF]/10 text-[#58A6FF] rounded-lg">
                        <BarChart3 size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Топ дефіциту по мережі</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Сумарний недобор у КГ</p>
                    </div>
                </div>

                <div className="space-y-5">
                    {deficitByCategory.map((d) => (
                        <div key={d.name} className="space-y-1.5">
                            <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-widest">
                                <span className="text-slate-300">{d.name}</span>
                                <span className="text-[#F85149]">{d.value} <span className="text-[8px] opacity-40">кг</span></span>
                            </div>
                            <div className="h-2 w-full bg-[#161B22] rounded-full overflow-hidden border border-[#30363D]" aria-hidden="true">
                                <div
                                    className="h-full bg-gradient-to-r from-[#F85149]/20 to-[#F85149] transition-all duration-1000"
                                    style={{ width: `${(d.value / maxDeficit) * 100}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Critical Store Widget */}
            <div className="bi-panel p-6 rounded-2xl border border-[#F85149]/20 bg-gradient-to-br from-[#161B22] to-[#F85149]/5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#F85149]/10 text-[#F85149] rounded-lg animate-pulse">
                            <StoreIcon size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">
                                {targetStore.replace('Магазин ', '')}: Тривога
                            </h3>
                            <p className="text-[10px] font-black text-[#F85149] uppercase mt-0.5">Критичний залишок</p>
                        </div>
                    </div>
                    <AlertTriangle className="text-[#F85149]" size={20} />
                </div>

                <div className="bg-[#0D1117]/50 rounded-xl p-4 border border-[#30363D]">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Обнулені позиції</p>
                    <div className="text-3xl font-mono font-black text-white mb-1">
                        {storeEmpty} <span className="text-sm text-[#F85149]">SKU</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-[#F85149]">
                        <TrendingDown size={14} />
                        <span>Потреба: ~120 кг</span>
                    </div>
                </div>

                <button className="w-full mt-4 py-3 border border-[#F85149]/30 hover:bg-[#F85149]/10 text-[#F85149] text-[10px] font-black uppercase tracking-[0.2em] rounded-lg transition-all focus:outline-none focus:ring-1 focus:ring-[#F85149]">
                    Переглянути деталі
                </button>
            </div>
        </div>
    );
};
