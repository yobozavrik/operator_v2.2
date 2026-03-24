'use client';

import React, { useMemo, useState } from 'react';
import { ProductionTask } from '@/types/bi';
import { cn } from '@/lib/utils';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AlertCircle, ChevronRight, Store } from 'lucide-react';
import { DistributionModal } from '@/components/DistributionModal';

interface Props {
    data: ProductionTask[];
}

export const StoreNeedGrid = ({ data }: Props) => {
    const [selectedStore, setSelectedStore] = useState<string | null>(null);

    // Grouping Logic
    const storeStats = useMemo(() => {
        const stats = new Map<string, {
            storeName: string;
            totalDeficit: number;
            totalRecommended: number;
            criticalItems: number;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            products: any[];
        }>();

        data.forEach(product => {
            product.stores.forEach(store => {
                const storeName = store.storeName;
                if (!stats.has(storeName)) {
                    stats.set(storeName, {
                        storeName,
                        totalDeficit: 0,
                        totalRecommended: 0,
                        criticalItems: 0,
                        products: []
                    });
                }

                const entry = stats.get(storeName)!;
                // Deficit calculation: Logic from user request (sum need_net)
                // Assuming 'deficitKg' or 'recommendedKg' maps to need_net in transformer
                const deficit = store.deficitKg;

                if (deficit > 0) {
                    entry.totalDeficit += deficit;
                    entry.products.push({
                        ...product,
                        storeSpecific: store
                    });
                }

                entry.totalRecommended += store.recommendedKg;
                if (store.deficitKg > 0 && store.currentStock === 0) {
                    entry.criticalItems += 1;
                }
            });
        });

        return Array.from(stats.values()).sort((a, b) => b.totalDeficit - a.totalDeficit);
    }, [data]);

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {storeStats.map(store => {
                    const isCritical = store.totalDeficit > 50 || store.criticalItems > 5; // Arbitrary thresholds for visual

                    return (
                        <div
                            key={store.storeName}
                            onClick={() => setSelectedStore(store.storeName)}
                            className={cn(
                                "rounded-xl border p-5 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] group relative overflow-hidden",
                                isCritical
                                    ? "bg-[#E74856]/10 border-[#E74856]/30 hover:bg-[#E74856]/20"
                                    : "bg-[#141829] border-white/5 hover:bg-[#1A1F3A]"
                            )}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-10 h-10 rounded-lg flex items-center justify-center",
                                        isCritical ? "bg-[#E74856]/20 text-[#E74856]" : "bg-white/5 text-white/40"
                                    )}>
                                        <Store size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white leading-tight">
                                            {store.storeName.replace('Магазин ', '').replace(/"/g, '')}
                                        </h3>
                                        <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mt-1">
                                            {store.products.length} позицій
                                        </p>
                                    </div>
                                </div>
                                {isCritical && (
                                    <div className="px-2 py-1 rounded bg-[#E74856] text-white text-[10px] font-bold uppercase tracking-wider animate-pulse">
                                        Критично
                                    </div>
                                )}
                            </div>

                            <div className="space-y-1">
                                <div className="flex items-baseline justify-between">
                                    <span className="text-xs text-white/40 font-bold uppercase tracking-wider">Загальний дефіцит</span>
                                    <span className={cn(
                                        "text-2xl font-mono font-bold",
                                        isCritical ? "text-[#E74856]" : "text-white"
                                    )}>
                                        {store.totalDeficit.toLocaleString()} <span className="text-sm opacity-50">шт</span>
                                    </span>
                                </div>
                            </div>

                            <ChevronRight className="absolute right-4 bottom-4 text-white/10 group-hover:text-white/30 transition-colors" />
                        </div>
                    );
                })}
            </div>

            {/* TODO: Reuse DistributionModal or simplified version for just showing deficit list */}
            {/* For now, using a placeholder warning or reusing the logic if I can import it cleanly.
                Actually, DistributionModal takes 'products', so I can filter products for this store and pass them.
            */}
            {selectedStore && (
                <DistributionModal
                    isOpen={!!selectedStore}
                    onClose={() => setSelectedStore(null)}
                    products={data.map(p => ({
                        ...p,
                        stores: p.stores.filter(s => s.storeName === selectedStore)
                    })).filter(p => p.stores.length > 0 && p.stores[0].deficitKg > 0)} // Show only products with deficit for this store
                // Customize title via props if supported, or just accept "Distribution" title for now? 
                // DistributionModal hardnames "Розподіл". I might need a simpler modal for "Needs".
                // But for speed, reusing is okay as "Drill down".
                />
            )}
        </div>
    );
};
