'use client';

import React, { useMemo } from 'react';
import useSWR from 'swr';
import { DashboardLayout } from '@/components/layout';
import { SeniorProductionMatrix } from '@/components/SeniorProductionMatrix';
import { SeniorAnalytics } from '@/components/SeniorAnalytics';
import { transformSupabaseData } from '@/lib/transformers';
import { SupabaseDeficitRow, BI_Metrics } from '@/types/bi';
import { useStore } from '@/context/StoreContext';

import { authedFetcher } from '@/lib/authed-fetcher';

const fetcher = authedFetcher;

export default function Dashboard() {
    const { data: rawDeficit, error: deficitError } = useSWR<SupabaseDeficitRow[]>('/api/graviton/deficit', fetcher, {
        refreshInterval: 30000
    });

    const { data: metrics, error: metricsError } = useSWR<BI_Metrics>('/api/graviton/metrics', fetcher, {
        refreshInterval: 15000
    });

    const queue = useMemo(() => rawDeficit ? transformSupabaseData(rawDeficit) : [], [rawDeficit]);

    const { currentCapacity } = useStore();
    const MAX_WEIGHT = currentCapacity;

    const currentWeight = metrics?.shopLoad || 0;
    const lastUpdate = metrics?.lastUpdate ? new Date(metrics.lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Оновлення...';

    if (deficitError || metricsError) {
        return (
            <DashboardLayout currentWeight={0} maxWeight={MAX_WEIGHT}>
                <div className="flex items-center justify-center min-h-[60vh] text-red-400 font-bold uppercase tracking-widest">
                    Помилка завантаження даних (Supabase)
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout currentWeight={currentWeight} maxWeight={MAX_WEIGHT}>
            <div className="grid grid-cols-12 gap-8 p-4 lg:p-8">
                {/* Main Column: Production Queue */}
                <div className="col-span-12 lg:col-span-8 space-y-8">
                    {/* Premium Header Card */}
                    <div className="glass-card p-6 animated-border-top">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-tighter text-glow">Черга Виробництва</h2>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                    Оновлено: {lastUpdate}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="hidden sm:flex items-center gap-2 px-4 py-2 glass-card text-[10px] font-bold text-[#00D4FF] uppercase tracking-widest">
                                    <div className="w-2 h-2 rounded-full bg-[#00D4FF] status-pulse" />
                                    Supabase Real-time: Активний
                                </div>
                            </div>
                        </div>
                    </div>

                    {!rawDeficit ? (
                        <div className="space-y-4">
                            {[1, 2, 3].map(i => <div key={i} className="h-24 glass-card animate-pulse" />)}
                        </div>
                    ) : (
                        <SeniorProductionMatrix queue={queue} />
                    )}
                </div>

                {/* Right Column: Analytics & Critical Info */}
                <div className="col-span-12 lg:col-span-4 space-y-8">
                    <div className="glass-card p-4">
                        <h2 className="text-sm font-black text-white uppercase tracking-widest text-glow">Оперативна Аналітика</h2>
                    </div>
                    <SeniorAnalytics queue={queue} />
                </div>
            </div>
        </DashboardLayout>
    );
}
