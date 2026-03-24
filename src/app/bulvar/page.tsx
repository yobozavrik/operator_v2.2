'use client';

import React from 'react';
import useSWR from 'swr';
import { BulvarProductionTabs } from '@/components/production/BulvarProductionTabs';
import { DashboardLayout } from '@/components/layout';
import { transformBulvarData } from '@/lib/transformers';
import { ChefHat } from 'lucide-react';

import { authedFetcher } from '@/lib/authed-fetcher';

const fetcher = authedFetcher;

export default function BulvarDashboard() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allProductsData, error, isLoading, mutate } = useSWR<any[]>(
        '/api/bulvar/orders',
        fetcher,
        { refreshInterval: 60000 }
    );

    const handleRefresh = React.useCallback(async () => {
        await mutate();
    }, [mutate]);

    React.useEffect(() => {
        const syncStocks = async () => {
            try {
                await fetch('/api/bulvar/update-stock', {
                    method: 'POST',
                    credentials: 'include',
                });
                await mutate();
            } catch {
                // Silent: dashboard still renders with the latest persisted Supabase snapshot.
            }
        };
        void syncStocks();
    }, [mutate]);

    const productQueue = React.useMemo(() => {
        if (!allProductsData) return [];
        return transformBulvarData(allProductsData);
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
                    <ChefHat size={48} className="text-[#00E0FF] animate-bounce" />
                    <span className="text-white/40 font-bold uppercase tracking-widest animate-pulse">
                        Завантаження кондитерських виробів...
                    </span>
                </div>
            </div>
        );
    }

    return (
        <DashboardLayout
            fullHeight={true}
        >
            <BulvarProductionTabs data={productQueue} onRefresh={handleRefresh} showTabs={true} />
        </DashboardLayout>
    );
}
