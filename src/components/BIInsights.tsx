'use client';

import React, { useMemo, useState } from 'react';
import { ProductionTask } from '@/types/bi';
import { AlertCircle, TrendingUp, MapPin, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { UI_TOKENS } from '@/lib/design-tokens';
import { useStore } from '@/context/StoreContext';

export const BIInsights = ({ queue }: { queue: ProductionTask[] }) => {
    const { selectedStore } = useStore();
    const [expandedStore, setExpandedStore] = useState<string | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [hoveredStore, setHoveredStore] = useState<string | null>(null);

    const insights = useMemo(() => {
        const riskStoresMap = queue.reduce((acc: Record<string, { count: number, items: string[] }>, t) => {
            t.stores.forEach(s => {
                if (selectedStore !== 'Усі' && s.storeName !== selectedStore) return;

                if (s.currentStock === 0) {
                    if (!acc[s.storeName]) acc[s.storeName] = { count: 0, items: [] };
                    acc[s.storeName].count++;
                    acc[s.storeName].items.push(t.name);
                }
            });
            return acc;
        }, {});

        const topRiskStores = Object.entries(riskStoresMap)
            .map(([store, data]) => ({ store, ...data }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        return { topRiskStores };
    }, [queue, selectedStore]);

    const toggleStore = (store: string) => {
        setExpandedStore(expandedStore === store ? null : store);
    };

    return (
        <div className="flex flex-col gap-4 h-full font-sans">
            {/* 🎯 HEADER SECTION - COMPACT */}
            <div className="flex flex-col items-center justify-center text-center space-y-1.5 mb-1">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#E74856]/10 border border-[#E74856]/20 shadow-[0_0_15px_rgba(231,72,86,0.1)]">
                    <AlertCircle size={12} className="text-[#E74856] animate-pulse" />
                    <span className="text-[9px] font-black text-[#E74856] uppercase tracking-[0.2em]">ЗВЕРНУТИ УВАГУ</span>
                </div>
            </div>

            {/* 🏬 RISK STORES GLASS PANEL */}
            <div className="glass-panel-premium p-0.5 rounded-xl overflow-hidden border-white/10">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                    <div className="p-1.5 rounded-lg bg-[#E74856]/10">
                        <MapPin size={14} className="text-[#E74856]" />
                    </div>
                    <div className="flex flex-col">
                        <h4 className="text-[11px] font-black text-white uppercase tracking-wider">
                            {selectedStore === 'Усі' ? 'Ризики дефіциту' : 'Аналіз ризиків'}
                        </h4>
                        <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest leading-none mt-0.5">
                            {selectedStore === 'Усі' ? 'Топ-3 критичних локацій' : selectedStore}
                        </span>
                    </div>
                </div>

                <div className="p-2.5 space-y-2">
                    {insights.topRiskStores.length === 0 ? (
                        <div className="py-4 text-center">
                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest italic">Ризиків не виявлено</span>
                        </div>
                    ) : (
                        insights.topRiskStores.map(({ store, count, items }) => (
                            <div key={store} className="relative group/card">
                                <button
                                    onClick={() => toggleStore(store)}
                                    onMouseEnter={() => setHoveredStore(store)}
                                    onMouseLeave={() => setHoveredStore(null)}
                                    className={cn(
                                        "w-full px-4 py-3 text-left rounded-lg transition-all duration-300 overflow-hidden border",
                                        expandedStore === store
                                            ? "border-[#E74856]/40 bg-[#E74856]/5 shadow-[0_0_15px_rgba(231,72,86,0.1)]"
                                            : "border-white/5 bg-white/[0.03] hover:bg-white/[0.05] hover:border-white/10"
                                    )}
                                    style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
                                >
                                    {/* Accent line */}
                                    <div className={cn(
                                        "absolute left-0 top-0 bottom-0 w-0.5 transition-transform duration-500",
                                        expandedStore === store ? "scale-y-100" : "scale-y-0"
                                    )} style={{ background: '#E74856' }} />

                                    <div className="flex items-center justify-between relative z-10">
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-black text-white/90 uppercase tracking-wide">
                                                {store}
                                            </span>
                                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-[0.1em] mt-0.5">
                                                {items.length} позицій
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col items-end">
                                                <span className="text-[12px] font-black text-[#E74856] leading-none">
                                                    {count}
                                                </span>
                                                <span className="text-[7px] font-black text-[#E74856]/60 uppercase tracking-tighter mt-0.5">ДЕФІЦИТ</span>
                                            </div>
                                            <ChevronRight size={14} className={cn(
                                                "transition-transform duration-300 text-white/10",
                                                expandedStore === store && "rotate-90 text-[#E74856]"
                                            )} />
                                        </div>
                                    </div>
                                </button>

                                {expandedStore === store && (
                                    <div className="mt-1 px-4 pb-2 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                        {items.map((item, idx) => (
                                            <div key={idx} className="flex items-center gap-2 py-1 border-b border-white/5 last:border-0 group/item">
                                                <div className="w-1 h-1 rounded-full bg-[#E74856]/40" />
                                                <span className="text-[9px] font-bold text-white/50 tracking-tight group-hover/item:text-white transition-colors">{item}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 📈 SYSTEM FORECAST - COMPACT */}
            <div className="glass-panel-premium p-4 rounded-xl flex flex-col items-center border-white/10">
                <div className="flex items-center gap-2 mb-3 self-start">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10">
                        <TrendingUp className="text-emerald-400" size={14} />
                    </div>
                    <h4 className="text-[11px] font-black text-white uppercase tracking-wider">Прогноз</h4>
                </div>

                <div className="w-full h-16 bg-black/20 rounded-lg border border-white/5 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute inset-0 opacity-10">
                        <svg className="w-full h-full" overflow="visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                            <path d="M0,80 Q15,20 30,50 T60,30 T90,60 L100,50" fill="none" stroke="#00D4FF" strokeWidth="1" className="animate-shimmer" />
                        </svg>
                    </div>
                    <span className="text-[9px] text-white/30 font-black uppercase tracking-[0.3em] mb-0.5 relative z-10">AI АНАЛІЗ</span>
                    <span className="text-[8px] text-white/10 font-bold uppercase tracking-widest relative z-10">Live Stream...</span>
                </div>
            </div>

            {/* ⚡ QUICK ACTIONS - MINI */}
            <div className="glass-panel-premium p-3 rounded-xl flex items-center justify-between gap-3 bg-[#E74856]/5 border-dashed border-[#E74856]/20">
                <div className="flex items-center gap-2">
                    <AlertCircle className="text-amber-500/60" size={14} />
                    <span className="text-[9px] font-black text-white/70 uppercase tracking-tight">Смарт-асистент</span>
                </div>
                <button
                    className="px-4 py-1.5 bg-emerald-600/80 hover:bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-lg active:scale-95 transition-all"
                >
                    Згенерувати
                </button>
            </div>
        </div>
    );
};
