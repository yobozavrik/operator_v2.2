'use client';

import React from 'react';
import useSWR from 'swr';
import { ProductionTabs } from '@/components/production/ProductionTabs';
import { DashboardLayout } from '@/components/layout';
import { transformPizzaData } from '@/lib/transformers';
import { ChefHat } from 'lucide-react';

import { authedFetcher } from '@/lib/authed-fetcher';

const fetcher = authedFetcher;

export default function PizzaDashboard() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allProductsData, error, isLoading, mutate } = useSWR<any[]>(
        '/api/pizza/orders',
        fetcher,
        { refreshInterval: 60000 }
    );

    const handleRefresh = React.useCallback(async () => {
        await mutate();
    }, [mutate]);

    const productQueue = React.useMemo(() => {
        if (!allProductsData) return [];
        return transformPizzaData(allProductsData);
    }, [allProductsData]);

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[var(--background)] text-[#E74856] font-bold uppercase tracking-widest">
                Помилка завантаження даних
            </div>
        );
    }

    if (isLoading || !allProductsData) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[var(--background)]">
                <div className="flex flex-col items-center gap-4">
                    <ChefHat size={48} className="text-[#FFB800] animate-bounce" />
                    <span className="text-white/40 font-bold uppercase tracking-widest animate-pulse">
                        Завантаження піци...
                    </span>
                </div>
            </div>
        );
    }

    return (
        <DashboardLayout
            fullHeight={true}
        >
            <ProductionTabs data={productQueue} onRefresh={handleRefresh} showTabs={true} />
        </DashboardLayout>
    );
}
