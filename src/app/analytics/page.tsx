'use client';

import React, { useMemo } from 'react';
import { DashboardLayout } from '@/components/layout';
import { MatrixTable } from '@/components/MatrixTable';
import { mockSKUs, getProductionQueue } from '@/lib/transformers';
import { useStore } from '@/context/StoreContext';

export default function AnalyticsPage() {
    const { currentCapacity } = useStore();
    const MAX_WEIGHT = currentCapacity;
    const queue = useMemo(() => getProductionQueue(mockSKUs), []);
    const currentWeight = useMemo(() => {
        return Number(queue.reduce((acc, item) => acc + item.recommendedQtyKg, 292).toFixed(0));
    }, [queue]);

    return (
        <DashboardLayout currentWeight={currentWeight} maxWeight={MAX_WEIGHT}>
            <div className="max-w-[1200px] mx-auto">
                {/* Outer Panel like SVG */}
                <div className="bg-[#0B0F14] rounded-[16px] border border-[#1F2630] p-6 lg:p-10 shadow-2xl min-h-[calc(100vh-160px)]">

                    {/* Header Shell */}
                    <div className="bg-[#111823] rounded-xl border border-[#202938] px-6 py-4 mb-6 flex justify-between items-center">
                        <h1 className="text-[18px] font-bold text-[#E6EDF3] tracking-tight">
                            SKU Матриця • Покриття залишків
                        </h1>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-[#E5534B]" />
                                <span className="text-[11px] text-[#8B949E]">Критичний дефіцит</span>
                            </div>
                        </div>
                    </div>

                    {/* Filter Bar */}
                    <div className="mb-8">
                        <MatrixTable skus={queue} />
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
