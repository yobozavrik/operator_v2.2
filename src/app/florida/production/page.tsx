'use client';

import React from 'react';
import useSWR from 'swr';
import { DashboardLayout } from '@/components/layout';
import { FloridaAnalyticsDashboard } from '@/components/analytics/FloridaAnalyticsDashboard';
import { transformFloridaData } from '@/lib/transformers';
import { ChefHat, BarChart3 } from 'lucide-react';

import { authedFetcher } from '@/lib/authed-fetcher';

const fetcher = authedFetcher;

export default function FloridaAnalyticsPage() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allProductsData, error: errorOrders, isLoading: loadingOrders } = useSWR<any[]>(
        '/api/florida/orders',
        fetcher,
        { refreshInterval: 60000 }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: trendsData, error: errorTrends, isLoading: loadingTrends } = useSWR<any[]>(
        '/api/florida/trends',
        fetcher,
        { refreshInterval: 60000 }
    );

    const productQueue = React.useMemo(() => {
        if (!allProductsData) return [];
        console.log('[FloridaAnalyticsPage] Raw API rows:', allProductsData.length);
        const transformed = transformFloridaData(allProductsData);
        console.log('[FloridaAnalyticsPage] Transformed tasks:', transformed.length);
        return transformed;
    }, [allProductsData]);

    if (errorOrders || errorTrends) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[var(--background)] text-[#EF4444] font-bold uppercase tracking-widest">
                Помилка завантаження даних
            </div>
        );
    }

    if (loadingOrders || loadingTrends || !allProductsData || !trendsData) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[var(--background)]">
                <div className="flex flex-col items-center gap-4">
                    <ChefHat size={48} className="text-[#F43F5E] animate-bounce" />
                    <span className="text-white/40 font-bold uppercase tracking-widest animate-pulse">
                        Завантаження Аналітики...
                    </span>
                </div>
            </div>
        );
    }

    return (
        <DashboardLayout fullHeight={true}>
            <div className="px-4 py-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                            <span className="w-8 h-8 rounded-lg bg-[#F43F5E]/20 flex items-center justify-center border border-[#F43F5E]/40 text-[#F43F5E]">
                                <BarChart3 size={18} />
                            </span>
                            Модуль Аналітики "Флорида"
                        </h1>
                        <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">
                            Ключові показники ефективності (KPI) напівфабрикатів та готових страв
                        </p>
                    </div>
                </div>

                <FloridaAnalyticsDashboard data={productQueue} trends={trendsData} />
            </div>
        </DashboardLayout>
    );
}
