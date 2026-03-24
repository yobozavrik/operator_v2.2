'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, AlertTriangle, Loader2 } from 'lucide-react';

interface PlanItem {
    plan_day: number;
    product_name: string;
    quantity: number;
    risk_index: number;
    prod_rank: number;
    plan_metadata: {
        deficit: number;
        avg_sales: number;
        was_inflated: boolean;
    };
}

interface OrderPlanApiRow {
    p_day: number;
    p_name: string;
    p_order: number;
    p_avg?: number;
}

export default function FloridaProductionSimulator() {
    const [days, setDays] = useState<number>(3);
    const [planData, setPlanData] = useState<PlanItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchPlan = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/florida/order-plan?days=${days}`);
                const payload = await response.json().catch(() => null);

                if (!response.ok) {
                    const message =
                        (payload && typeof payload.error === 'string' && payload.error) ||
                        `HTTP ${response.status}`;
                    throw new Error(message);
                }

                const rows = Array.isArray(payload) ? (payload as OrderPlanApiRow[]) : [];
                const mappedData = rows.map((item) => ({
                    plan_day: Number(item.p_day) || 0,
                    product_name: String(item.p_name || ''),
                    quantity: Number(item.p_order) || 0,
                    risk_index: Math.round(Number(item.p_avg) || 0),
                    prod_rank: 0,
                    plan_metadata: {
                        deficit: 0,
                        avg_sales: Number(item.p_avg) || 0,
                        was_inflated: false,
                    },
                }));

                setPlanData(mappedData);
            } catch (err: unknown) {
                console.error('Error fetching plan:', err);
                setError(err instanceof Error ? err.message : 'Помилка завантаження плану');
                // У разі помилки можна очистити дані або показати попередні
                setPlanData([]);
            } finally {
                setIsLoading(false);
            }
        };

        // Дебаунс 600мс для зменшення кількості запитів при зміні горизонту
        const timer = setTimeout(() => {
            fetchPlan();
        }, 600);

        return () => clearTimeout(timer);
    }, [days]);

    // Групування по днях
    const groupedPlan = useMemo(() => {
        return planData.reduce((acc, row) => {
            if (!acc[row.plan_day]) acc[row.plan_day] = [];
            acc[row.plan_day].push(row);
            return acc;
        }, {} as Record<number, PlanItem[]>);
    }, [planData]);

    return (
        <div className="h-full bg-bg-primary p-4 md:p-8 font-sans text-text-primary overflow-y-auto custom-scrollbar">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Панель управління */}
                <div className="bg-panel-bg border border-panel-border rounded-2xl shadow-[var(--panel-shadow)] p-6">
                    {/* Horizon Selector */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <span className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2 font-[family-name:var(--font-jetbrains)]">
                            <TrendingUp size={16} className="text-[#00E0FF]" />
                            Горизонт планування:
                        </span>
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map(d => (
                                <button
                                    key={d}
                                    onClick={() => setDays(d)}
                                    className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all border tracking-widest font-[family-name:var(--font-jetbrains)] ${days === d
                                        ? 'bg-[#00E0FF]/10 border-[#00E0FF]/50 text-[#00E0FF] shadow-[0_0_10px_rgba(0,224,255,0.2)]'
                                        : 'bg-bg-primary border-panel-border text-text-secondary hover:text-text-primary hover:border-text-muted hover:bg-panel-border/30'
                                        }`}
                                >
                                    {d} {d === 1 ? 'ДЕНЬ' : 'ДНІ'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Помилка */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3 text-red-400 font-[family-name:var(--font-jetbrains)] backdrop-blur-sm">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <span className="font-bold text-sm">Помилка: {error}</span>
                    </div>
                )}

                {/* Результати (Таблиці по днях) */}
                <div className="relative min-h-[400px]">
                    {/* Індикатор завантаження */}
                    {isLoading && (
                        <div className="absolute inset-0 z-10 bg-bg-primary/60 backdrop-blur-[2px] rounded-2xl flex items-center justify-center transition-all duration-300">
                            <div className="flex flex-col items-center gap-3 text-orange-500 bg-panel-bg px-8 py-6 rounded-2xl shadow-[var(--panel-shadow)] border border-panel-border">
                                <Loader2 className="w-8 h-8 animate-spin" />
                                <span className="text-xs font-bold tracking-widest uppercase font-[family-name:var(--font-jetbrains)] text-text-primary">Перерахунок плану...</span>
                            </div>
                        </div>
                    )}

                    {/* ВСЬОГО */}
                    <div className="mt-4 mb-4">
                        <h2 className="text-xl font-bold text-orange-500 mb-4 font-[family-name:var(--font-chakra)] uppercase flex items-center gap-2">
                            <span className="text-2xl">🏭</span> СИМУЛЯТОР ФЛОРИДА
                        </h2>
                        <div className="grid gap-6 lg:grid-cols-3">
                            {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
                                const dayPlan = groupedPlan[day] || [];
                                const totalForDay = dayPlan.reduce((sum, item) => sum + item.quantity, 0);

                                return (
                                    <div key={`florida-${day}`} className="bg-panel-bg border border-panel-border rounded-2xl shadow-[var(--panel-shadow)] overflow-hidden flex flex-col">
                                        <div className="p-4 border-b border-panel-border bg-[#131B2C]/50 flex items-center justify-between">
                                            <h3 className="font-bold text-text-primary flex items-center gap-2 font-[family-name:var(--font-chakra)] text-lg uppercase tracking-wide">
                                                <div className="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-500 border border-orange-500/30 flex items-center justify-center font-bold text-sm shadow-[0_0_8px_rgba(255,138,0,0.15)]">
                                                    Д{day}
                                                </div>
                                                Зміна {day}
                                            </h3>
                                            <div className="text-sm font-black text-orange-400 bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20 shadow-[0_0_10px_rgba(255,138,0,0.1)] font-[family-name:var(--font-jetbrains)]">
                                                {totalForDay > 0 ? `${totalForDay} од.` : '—'}
                                            </div>
                                        </div>
                                        <div className="flex-1 p-2 overflow-y-auto max-h-[600px] custom-scrollbar">
                                            {dayPlan.length === 0 && !isLoading ? (
                                                <div className="flex items-center justify-center h-32 text-text-muted text-xs uppercase tracking-widest font-[family-name:var(--font-jetbrains)] font-bold">Немає даних</div>
                                            ) : (
                                                <ul className="space-y-1">
                                                    {dayPlan.map((row, idx) => (
                                                        <li key={idx} className="flex items-center justify-between p-3 rounded-xl hover:bg-bg-primary transition-colors border border-transparent hover:border-panel-border group">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-text-primary text-sm group-hover:text-orange-400 transition-colors leading-tight">{row.product_name}</span>
                                                                <div className="flex items-center gap-2 mt-2 leading-none">
                                                                    <span className="text-[10px] text-text-secondary font-mono tracking-wide px-1.5 py-0.5 rounded bg-panel-border/30 border border-panel-border">R: {row.risk_index}</span>
                                                                </div>
                                                            </div>
                                                            <div className="text-right pl-3 flex-shrink-0">
                                                                <span className="text-lg font-black text-orange-400 tabular-nums font-[family-name:var(--font-chakra)] p-2">{row.quantity}</span>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
