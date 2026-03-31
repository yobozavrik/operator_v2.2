'use client';

import React from 'react';
import useSWR from 'swr';
import { ProductionTabs } from '@/components/production/ProductionTabs';
import { DashboardLayout } from '@/components/layout';
import { transformPizzaData } from '@/lib/transformers';
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
            <div className="flex min-h-screen items-center justify-center bg-[var(--background)] font-bold uppercase tracking-widest text-[#E74856]">
                Помилка завантаження даних
            </div>
        );
    }

    return (
        <DashboardLayout fullHeight={true}>
            <ProductionTabs
                data={productQueue}
                onRefresh={handleRefresh}
                showTabs={true}
                isLoading={isLoading && !allProductsData}
            />
        </DashboardLayout>
    );
}
