'use client';

import React, { useState, useMemo } from 'react';
import { STORES } from '@/lib/transformers';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ProductionTask, SKUCategory, PriorityKey } from '@/types/bi';
import { cn } from '@/lib/utils';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Search, Filter, ChevronDown } from 'lucide-react';
import { UI_TOKENS } from '@/lib/design-tokens';
import { useStore } from '@/context/StoreContext';

export const MatrixTable = ({ skus }: { skus: ProductionTask[] }) => {
    const { selectedStore, setSelectedStore } = useStore();
    const [onlyCritical, setOnlyCritical] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('Усі');
    const [selectedPriority, setSelectedPriority] = useState<string>('Усі');

    const filteredSkus = useMemo(() => {
        return skus.filter(sku => {
            const matchesSearch = sku.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = selectedCategory === 'Усі' || sku.category === selectedCategory;
            const matchesCritical = !onlyCritical || sku.outOfStockStores > 0;
            const matchesStore = selectedStore === 'Усі' || sku.stores.some(s => s.storeName === selectedStore);
            const matchesPriority = selectedPriority === 'Усі' || sku.priority === selectedPriority;
            return matchesSearch && matchesCategory && matchesCritical && matchesStore && matchesPriority;
        });
    }, [skus, searchQuery, selectedCategory, onlyCritical, selectedStore, selectedPriority]);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const categories = ['Усі', ...Array.from(new Set(skus.map(s => s.category)))];

    const getCellColor = (stock: number, threshold: number) => {
        if (stock === 0) return 'rgba(229, 83, 75, 0.15)'; // Critical
        if (stock < threshold / 4) return 'rgba(246, 195, 67, 0.1)'; // High
        if (stock < threshold) return 'rgba(88, 166, 255, 0.08)'; // Reserve
        return 'rgba(63, 185, 80, 0.05)'; // Normal
    };

    const getTextColor = (stock: number, threshold: number) => {
        if (stock === 0) return UI_TOKENS.colors.priority.critical;
        if (stock < threshold / 4) return UI_TOKENS.colors.priority.high;
        if (stock < threshold) return UI_TOKENS.colors.priority.reserve;
        return UI_TOKENS.colors.priority.normal;
    };

    return (
        <div className="flex flex-col gap-6">
            {/* UI Spec Style Filters Bar */}
            <div className="bg-[#111823] border border-[#1F2630] rounded-xl px-4 py-2 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">
                    <Filter size={14} className="text-[#8B949E]" />
                    <span className="text-[11px] font-bold text-[#8B949E] uppercase tracking-widest">Фільтри</span>
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="bg-transparent text-[12px] font-bold text-[#E6EDF3] outline-none cursor-pointer hover:text-[#58A6FF] transition-colors"
                    >
                        <option value="Усі">Всі Категорії</option>
                        {Array.from(new Set(skus.map(s => s.category))).map(cat => (
                            <option key={cat} value={cat} className="bg-[#111823]">{cat}</option>
                        ))}
                    </select>
                    <span className="text-[#2B2B2B]">|</span>
                    <select
                        value={selectedStore}
                        onChange={(e) => setSelectedStore(e.target.value)}
                        className="bg-transparent text-[12px] font-bold text-[#E6EDF3] outline-none cursor-pointer hover:text-[#58A6FF] transition-colors"
                    >
                        <option value="Усі">Всі Магазини</option>
                        {STORES.map(s => (
                            <option key={s} value={s} className="bg-[#111823]">{s}</option>
                        ))}
                    </select>
                    <span className="text-[#2B2B2B]">|</span>
                    <select
                        value={selectedPriority}
                        onChange={(e) => setSelectedPriority(e.target.value)}
                        className="bg-transparent text-[12px] font-bold text-[#E6EDF3] outline-none cursor-pointer hover:text-[#58A6FF] transition-colors"
                    >
                        <option value="Усі">Пріоритет</option>
                        <option value="critical" className="bg-[#111823]">Критично</option>
                        <option value="high" className="bg-[#111823]">Високий</option>
                        <option value="reserve" className="bg-[#111823]">Резерв</option>
                        <option value="normal" className="bg-[#111823]">Норма</option>
                    </select>
                    <span className="text-[#2B2B2B]">|</span>
                    <button
                        onClick={() => setOnlyCritical(!onlyCritical)}
                        className={cn(
                            "text-[12px] font-bold transition-colors px-2 py-1 rounded-md",
                            onlyCritical ? "text-[#E5534B] bg-[#E5534B]/10" : "text-[#8B949E] hover:text-[#E6EDF3]"
                        )}
                    >
                        Магазини OOS
                    </button>
                </div>

                <div className="flex-1" />

                <div className="relative group">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E] group-hover:text-[#58A6FF] transition-colors" />
                    <input
                        type="text"
                        placeholder="Шукати по артикулу чи назві..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-[#222325]/50 border border-[#2B2B2B] rounded-lg pl-9 pr-4 py-1.5 text-[12px] text-[#E6EDF3] placeholder-[#8B949E] outline-none focus:border-[#58A6FF]/50 transition-all w-60"
                    />
                </div>
            </div>

            {/* Matrix Table Container */}
            <div className="bg-[#0F1622] border border-[#1E2A3A] rounded-xl overflow-hidden shadow-xl p-6">
                <div className="overflow-x-auto custom-scrollbar">
                    <div className="min-w-[1000px] space-y-2">
                        {/* Header Box */}
                        <div className="bg-[#111823] rounded-lg px-6 py-4 flex items-center justify-between mb-4 border border-transparent">
                            <div className="w-80">
                                <span className="text-[11px] font-black text-[#8B949E] uppercase tracking-widest">Артикул / Назва</span>
                            </div>
                            <div className="flex-1 flex items-center justify-around">
                                {STORES.map(store => (
                                    <div key={store} className="w-20 text-center">
                                        <span className="text-[10px] font-black text-[#8B949E] uppercase tracking-tighter">{store}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="w-28 text-right">
                                <span className="text-[11px] font-black text-[#8B949E] uppercase tracking-widest">РАЗОМ</span>
                            </div>
                        </div>

                        {/* SKU Rows */}
                        <div className="space-y-4">
                            {filteredSkus.map((sku) => (
                                <div
                                    key={sku.id}
                                    className="bg-[#0B0F14] border border-[#1E2A3A] rounded-lg px-6 py-4 flex items-center justify-between transition-all hover:border-[#58A6FF]/30 hover:bg-[#0E1520] group"
                                >
                                    <div className="w-80">
                                        <span className="text-[12px] font-bold text-[#E6EDF3] group-hover:text-white transition-colors">{sku.name}</span>
                                        <div className="text-[9px] text-[#8B949E] font-bold mt-0.5 opacity-60">ID: {sku.productCode}</div>
                                    </div>

                                    <div className="flex-1 flex items-center justify-around">
                                        {STORES.map(storeName => {
                                            const storeData = sku.stores.find(s => s.storeName === storeName);
                                            const stock = storeData ? storeData.currentStock : 0;
                                            const threshold = storeData ? storeData.minStock : sku.minStockThresholdKg;
                                            const bgColor = getCellColor(stock, threshold);
                                            const textColor = getTextColor(stock, threshold);
                                            return (
                                                <div key={storeName} className="w-20 flex justify-center">
                                                    <div
                                                        className="w-14 py-2 rounded-lg border border-white/5 flex items-center justify-center transition-all group-hover:scale-110"
                                                        style={{ backgroundColor: bgColor }}
                                                    >
                                                        <span
                                                            className="text-[11px] font-black tracking-tighter"
                                                            style={{ color: textColor }}
                                                        >
                                                            {storeData ? stock.toFixed(1) : '-'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="w-28 text-right">
                                        <span className="text-[12px] font-black text-[#58A6FF]">{sku.totalStockKg.toFixed(1)}</span>
                                        <span className="text-[9px] text-[#8B949E] ml-1">кг</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {filteredSkus.length === 0 && (
                <div className="p-20 text-center flex flex-col items-center gap-2">
                    <span className="text-[14px] font-bold text-[#E6EDF3]">Нічого не знайдено</span>
                    <span className="text-[11px] text-[#8B949E]">Спробуйте змінити пошуковий запит або фільтри</span>
                </div>
            )}
        </div>
    );
};
