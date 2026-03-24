'use client';

import React from 'react';
import { ProductionTask, Store } from '@/types/bi';
import { cn } from '@/lib/utils';
import { ChevronRight, Plus } from 'lucide-react';

const StoreStatusMatrix = ({ stores }: { stores: Store[] }) => {
    return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-md border border-white/5">
            {stores.map((store) => {
                const stock = store.currentStock;
                const minStock = store.minStock;
                let colorClass = "text-[#3FB950]"; // Green
                if (stock === 0) colorClass = "text-[#F85149]"; // Red
                else if (stock < minStock / 3) colorClass = "text-[#D29922]"; // Yellow
                else if (stock < minStock) colorClass = "text-[#58A6FF]"; // Blue

                return (
                    <div
                        key={store.storeName}
                        className={cn("dot-neon", colorClass)}
                        title={`${store.storeName}: ${stock.toFixed(1)} / ${minStock.toFixed(1)} кг`}
                    />
                );
            })}
        </div>
    );
};

export const SeniorProductionMatrix = ({ queue }: { queue: ProductionTask[] }) => {
    const categories = Array.from(new Set(queue.map(t => t.category)));

    return (
        <div className="space-y-8 pb-12">
            {categories.map((cat) => {
                const tasks = queue.filter(t => t.category === cat);
                if (tasks.length === 0) return null;

                return (
                    <section key={cat} className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                            <span className="text-lg" aria-hidden="true">🥟</span>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">{cat}</h3>
                            <div className="h-px flex-1 bg-gradient-to-r from-[#30363D] to-transparent ml-4" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase">{tasks.length} позицій</span>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                            {tasks.map((item) => (
                                <div
                                    key={item.id}
                                    className="bi-panel p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-[#58A6FF]/30 transition-all cursor-pointer"
                                    role="listitem"
                                >
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className={cn(
                                            "w-1 h-8 rounded-full",
                                            item.priority === 'critical' ? "bg-[#F85149]" : "bg-[#30363D]"
                                        )} />
                                        <div>
                                            <h4 className="text-sm font-bold text-white group-hover:text-[#58A6FF] transition-colors">{item.name}</h4>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">
                                                ПРОГНОЗ: <span className="text-white">{item.dailyForecastKg}кг/день</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-8">
                                        <div className="text-left min-w-[70px] hidden sm:block">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Прогноз 24H</p>
                                            <p className="text-sm font-mono font-bold text-slate-300">
                                                {item.dailyForecastKg.toFixed(1)} <span className="text-[8px] opacity-40">кг</span>
                                            </p>
                                        </div>

                                        <div className="text-left min-w-[60px]">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Дефіцит %</p>
                                            <p className={cn(
                                                "text-lg font-mono font-black leading-none",
                                                item.deficitPercent > 60 ? "text-[#F85149]" :
                                                    item.deficitPercent > 30 ? "text-[#F59E0B]" : "text-[#3FB950]"
                                            )}>
                                                {Math.round(item.deficitPercent || 0)}%
                                            </p>
                                        </div>

                                        <div className="text-right min-w-[70px]">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">План</p>
                                            <p className="text-lg font-mono font-black text-white leading-none">
                                                +{item.recommendedQtyKg} <span className="text-[10px] opacity-40">кг</span>
                                            </p>
                                        </div>

                                        <div className="hidden lg:block">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1 ml-1 text-center">Мережа</p>
                                            <StoreStatusMatrix stores={item.stores} />
                                        </div>

                                        <button className="h-10 px-4 bg-[#238636] hover:bg-[#2EA043] text-white rounded-md flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-green-900/20 uppercase text-[10px] font-black tracking-widest">
                                            <Plus size={16} />
                                            В ПЛАН +50КГ
                                        </button>

                                        <button className="p-2 text-slate-500 hover:text-white transition-colors" aria-label="Детальніше">
                                            <ChevronRight size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                );
            })}
        </div>
    );
};
