'use client';

import React from 'react';
import useSWR from 'swr';
import { FloridaProductionTabs } from '@/components/production/FloridaProductionTabs';
import { DashboardLayout } from '@/components/layout';
import { transformFloridaData } from '@/lib/transformers';
import { ChefHat } from 'lucide-react';

import { authedFetcher } from '@/lib/authed-fetcher';

const fetcher = authedFetcher;

export default function FloridaDashboard() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allProductsData, error, isLoading, mutate } = useSWR<any[]>(
        '/api/florida/orders',
        fetcher,
        { refreshInterval: 60000 }
    );

    const handleRefresh = React.useCallback(async () => {
        await mutate();
    }, [mutate]);

    React.useEffect(() => {
        const syncStocks = async () => {
            try {
                await fetch('/api/florida/update-stock', {
                    method: 'POST',
                    credentials: 'include',
                });
                await mutate();
            } catch {
                // Silent: dashboard still renders with existing data/fallbacks.
            }
        };
        void syncStocks();
    }, [mutate]);

    const productQueue = React.useMemo(() => {
        if (!allProductsData) return [];
        return transformFloridaData(allProductsData);
    }, [allProductsData]);

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[var(--background)] text-[#EF4444] font-bold uppercase tracking-widest">
                Помилка завантаження даних
            </div>
        );
    }

    if (isLoading || !allProductsData) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[var(--background)]">
                <div className="flex flex-col items-center gap-4">
                    <ChefHat size={48} className="text-[#F43F5E] animate-bounce" />
                    <span className="text-white/40 font-bold uppercase tracking-widest animate-pulse">
                        Завантаження даних Флоріди...
                    </span>
                </div>
            </div>
        );
    }

    return (
        <DashboardLayout
            fullHeight={true}
        >
            <FloridaProductionTabs data={productQueue} onRefresh={handleRefresh} showTabs={true} />
        </DashboardLayout>
    );
}
