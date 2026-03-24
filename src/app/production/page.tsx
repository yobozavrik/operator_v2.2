'use client';

import React, { useMemo, useEffect, useState } from 'react';
import useSWR from 'swr';
import { DashboardLayout } from '@/components/layout';
import { TaskCard } from '@/components/TaskCard';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ProductionTask, BI_Metrics, SupabaseDeficitRow, SKUCategory } from '@/types/bi';
import { transformDeficitData } from '@/lib/transformers';
import { ErrorBoundary } from '@/components/ErrorBoundary';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { RotateCw, Globe } from 'lucide-react';
import { UI_TOKENS } from '@/lib/design-tokens';
import { useStore } from '@/context/StoreContext';
import { ContextBridge } from '@/components/context-bridge';

import { authedFetcher } from '@/lib/authed-fetcher';

const fetcher = authedFetcher;

const HeaderKPI = ({ label, value }: { label: string; value: string | number }) => (
    <div className="px-5 py-3 bg-[#141C27] rounded-[10px] min-w-[150px] border border-[#1F2630] flex flex-col justify-center">
        <span className="text-[11px] font-bold text-[#8B949E] uppercase tracking-widest mb-1">{label}</span>
        <span className="text-[14px] font-black text-[#E6EDF3]">{value}</span>
    </div>
);

const LegendItem = ({ color, label }: { color: string; label: string }) => (
    <div className="flex items-center gap-2 px-2">
        <div className="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]" style={{ backgroundColor: color }} />
        <span className="text-[12px] font-medium text-[#E6EDF3] tracking-tight">{label}</span>
    </div>
);

export default function ProductionPage() {
    const { currentCapacity } = useStore();
    const { data: deficitData, error: deficitError, mutate: mutateDeficit } = useSWR<SupabaseDeficitRow[]>(
        '/api/graviton/deficit',
        fetcher,
        { refreshInterval: 30000 }
    );

    const { data: metrics, error: metricsError, mutate: mutateMetrics } = useSWR<BI_Metrics>(
        '/api/graviton/metrics',
        fetcher,
        { refreshInterval: 30000 }
    );

    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [now, setNow] = useState(new Date());

    const tasks = useMemo((): ProductionTask[] => {
        if (!deficitData || !Array.isArray(deficitData)) return [];
        return transformDeficitData(deficitData);
    }, [deficitData]);

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const tasksByCategory = useMemo(() => {
        const grouped: Record<string, ProductionTask[]> = {};
        tasks.forEach(task => {
            if (!grouped[task.category]) grouped[task.category] = [];
            grouped[task.category].push(task);
        });
        return grouped;
    }, [tasks]);

    const formattedDate = now.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
    const formattedTime = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            // Список 7 магазинів для оновлення залишків Гравітону (відредагуйте їх ID/назви відповідно до вашого Poster/KeyCRM)
            const TARGET_STORES = [3, 6, 10, 16, 17, 20]; // Наприклад: Кварц, Руська, Садгора, Хотинська, Компас, Білоруська

            const response = await fetch('http://localhost:5678/webhook-test/operator', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'refresh_stock',
                    timestamp: new Date().toISOString(),
                    store_ids: TARGET_STORES
                })
            });

            if (response.ok) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                await Promise.all([mutateDeficit(), mutateMetrics()]);
            }
        } catch (err) {
            console.error('Refresh error:', err);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleStatusChange = (taskId: string, status: ProductionTask['status']) => {
        console.log(`Task ${taskId} status changed to ${status}`);
    };

    if (deficitError || metricsError) {
        return <div className="p-10 text-red-500 font-bold">Помилка завантаження даних виробництва.</div>;
    }

    if (!metrics || !deficitData) {
        return <div className="p-10 text-slate-500 animate-pulse uppercase font-bold">Синхронізація двигуна виробництва...</div>;
    }

    return (
        <DashboardLayout currentWeight={metrics.shopLoad} maxWeight={currentCapacity}>
            <div className="max-w-[1200px] mx-auto min-h-[calc(100vh-160px)] space-y-4">
                <ContextBridge
                    role="Production Chief"
                    area="Shift execution / production queue"
                    workshop="Graviton"
                    tone="amber"
                    links={[
                        { href: '/', label: 'Role hub' },
                        { href: '/production-chief', label: 'Production workspace' },
                        { href: '/workshops', label: 'Workshops' },
                    ]}
                />
                {/* Outer Panel like SVG */}
                <div className="bg-[#0B0F14] rounded-[16px] border border-[#1F2630] p-6 lg:p-10 shadow-2xl h-full flex flex-col">

                    {/* Header Shell according to SVG */}
                    <div className="bg-[#111823] rounded-xl border border-[#202938] px-8 py-5 mb-6 flex flex-col md:flex-row justify-between items-center gap-6 shadow-xl relative overflow-hidden">
                        {/* Interactive Background Glow */}
                        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#58A6FF]/20 to-transparent" />

                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-3">
                                <h1 className="text-[18px] font-black text-[#E6EDF3] tracking-tighter uppercase whitespace-nowrap">
                                    Галя Балувана <span className="text-[#8B949E] px-1">•</span> <span className="text-[#58A6FF]">Центр управління</span>
                                </h1>
                                <div className="bg-[#1F6FEB] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-[0_0_15px_rgba(31,111,235,0.3)]">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">LIVE</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] font-bold text-[#8B949E] uppercase tracking-[0.1em]">
                                <span>{formattedDate}</span>
                                <span className="text-[#3FB950]">•</span>
                                <span className="text-[#E6EDF3]">{formattedTime}</span>
                                <span className="text-[#3FB950]">•</span>
                                <span className="text-[#3FB950]">ОНЛАЙН</span>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <HeaderKPI label="Дефіцит кг" value="1.2k кг" />
                            <HeaderKPI label="Критичні SKU" value={metrics.criticalSKU} />
                            <HeaderKPI label="Завантаження" value={`${Math.round(metrics.shopLoad / ((currentCapacity || 450) / 100))}%`} />
                            <HeaderKPI label="Зміна / SLA" value="98%" />
                        </div>
                    </div>

                    {/* Legend Bar matching SVG */}
                    <div className="bg-[#111823] rounded-xl border border-[#1F2630] px-6 py-4 mb-8 flex items-center gap-8 shadow-sm">
                        <span className="text-[11px] font-black text-[#8B949E] uppercase tracking-[0.15em]">Легенда:</span>
                        <div className="flex items-center gap-8">
                            <LegendItem color={UI_TOKENS.colors.priority.critical} label="Critical" />
                            <LegendItem color={UI_TOKENS.colors.priority.high} label="High" />
                            <LegendItem color={UI_TOKENS.colors.priority.reserve} label="Reserve" />
                            <LegendItem color={UI_TOKENS.colors.priority.normal} label="Normal" />
                        </div>
                    </div>

                    {/* Main Content Columns matching SVG */}
                    <div className="flex-1 grid grid-cols-12 gap-8">
                        {/* Column 1: Queue */}
                        <div className="col-span-12 lg:col-span-4 flex flex-col">
                            <div className="flex items-center gap-3 mb-6 px-2">
                                <h2 className="text-[14px] font-black text-[#E6EDF3] tracking-tight">Production Queue</h2>
                                <div className="flex-1 h-px bg-gradient-to-r from-[#1F2630] to-transparent" />
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2">
                                <ErrorBoundary>
                                    {Object.entries(tasksByCategory).map(([category, catTasks]) => (
                                        <div key={category} className="space-y-3">
                                            <h3 className="text-[10px] font-black text-[#8B949E] uppercase tracking-[0.2em] flex items-center gap-2">
                                                <div className="w-1 h-3 bg-[#58A6FF] rounded-full" />
                                                {category}
                                            </h3>
                                            <div className="space-y-4">
                                                {catTasks.map(task => (
                                                    <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </ErrorBoundary>
                            </div>
                        </div>

                        {/* Column 2: Analytics */}
                        <div className="col-span-12 lg:col-span-4 flex flex-col border-x border-[#1F2630] border-dashed px-4">
                            <div className="flex items-center gap-3 mb-6 px-2">
                                <h2 className="text-[14px] font-black text-[#E6EDF3] tracking-tight">Network Analytics</h2>
                                <div className="flex-1 h-px bg-gradient-to-r from-[#1F2630] to-transparent" />
                            </div>
                            <div className="space-y-6">
                                <div className="bg-[#0F1622] rounded-xl border border-[#1E2A3A] p-6 h-[170px] shadow-sm">
                                    <h3 className="text-[12px] font-bold text-[#8B949E] uppercase tracking-widest mb-4">Top deficit by category</h3>
                                    <div className="h-full opacity-20 border-t border-dashed border-[#1E2A3A] mt-8" />
                                </div>
                                <div className="bg-[#0F1622] rounded-xl border border-[#1E2A3A] p-6 h-[190px] shadow-sm">
                                    <h3 className="text-[12px] font-bold text-[#8B949E] uppercase tracking-widest mb-4">Store risk heatmap</h3>
                                    <div className="grid grid-cols-6 gap-2 mt-4">
                                        {Array.from({ length: 18 }).map((_, i) => (
                                            <div key={i} className="aspect-square rounded-md bg-[#E5534B]/10 border border-[#E5534B]/20 transition-all hover:bg-[#E5534B]/20 cursor-pointer" />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Column 3: Alerts */}
                        <div className="col-span-12 lg:col-span-4 flex flex-col">
                            <div className="flex items-center gap-3 mb-6 px-2">
                                <h2 className="text-[14px] font-black text-[#E6EDF3] tracking-tight">Alerts & Actions</h2>
                                <div className="flex-1 h-px bg-gradient-to-r from-[#1F2630] to-transparent" />
                            </div>
                            <div className="space-y-6">
                                <div className="bg-[#1A0F14] rounded-xl border border-[#3A1E2A] p-6 h-[130px] shadow-[inset_0_0_20px_rgba(229,83,75,0.05)] transition-all hover:border-[#F85149]/50">
                                    <h3 className="text-[12px] font-black text-[#F85149] uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#F85149] animate-pulse" />
                                        Critical Stores
                                    </h3>
                                    <p className="text-[11px] text-[#8B949E] leading-relaxed">3 локації потребують негайного поповнення SKU для запобігання відсутності товару.</p>
                                </div>
                                <div className="bg-[#0F1622] rounded-xl border border-[#1E2A3A] p-6 flex-1 min-h-[230px] shadow-sm">
                                    <h3 className="text-[12px] font-bold text-[#8B949E] uppercase tracking-widest mb-6">Action panel</h3>
                                    <div className="space-y-3">
                                        <button
                                            onClick={handleRefresh}
                                            disabled={isRefreshing}
                                            className="w-full py-3 bg-[#58A6FF] text-[#0B0F14] text-[11px] font-black uppercase rounded-lg shadow-lg shadow-blue-500/10 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {isRefreshing && <RotateCw size={14} className="animate-spin" />}
                                            {isRefreshing ? 'Оновлення...' : 'Оновити залишки'}
                                        </button>
                                        <button className="w-full py-3 border border-[#1E2A3A] text-[#8B949E] text-[11px] font-black uppercase rounded-lg hover:bg-white/5 transition-all">
                                            Синхронізувати вебхук
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
