'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Settings2, TrendingUp, AlertTriangle, Loader2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

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

export default function BulvarProductionSimulator() {
    const [days, setDays] = useState<number>(3);
    const [planData, setPlanData] = useState<PlanItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
        const fetchPlan = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // Виклик RPC-функції Supabase для Бульвар-Автовокзалу
                const { data, error } = await supabase.rpc('f_generate_production_plan_bulvar', {
                    p_days: days
                });

                if (error) throw error;

                if (data) {
                    // Map the response fields back to the PlanItem interface
                    // f_generate_production_plan_bulvar returns: plan_day, product_name, quantity, predicted_risk
                    const mappedData = data.map((item: any) => ({
                        plan_day: item.plan_day,
                        product_name: item.product_name,
                        quantity: item.quantity,
                        risk_index: item.predicted_risk,
                        prod_rank: 0, // not returned bybulvar func
                        plan_metadata: {
                            deficit: 0,
                            avg_sales: 0,
                            was_inflated: false
                        }
                    }));
                    setPlanData(mappedData);
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) {
                console.error('Error fetching plan:', err);
                setError(err.message);
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
                            <TrendingUp size={16} className="text-accent-primary" />
                            Горизонт планування:
                        </span>
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map(d => (
                                <button
                                    key={d}
                                    onClick={() => setDays(d)}
                                    className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all border tracking-widest font-[family-name:var(--font-jetbrains)] ${days === d
                                        ? 'bg-accent-primary/10 border-accent-primary/40 text-accent-primary shadow-[var(--panel-shadow)]'
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
                            <div className="flex flex-col items-center gap-3 text-accent-primary bg-panel-bg px-8 py-6 rounded-2xl shadow-[var(--panel-shadow)] border border-panel-border">
                                <Loader2 className="w-8 h-8 animate-spin" />
                                <span className="text-xs font-bold tracking-widest uppercase font-[family-name:var(--font-jetbrains)] text-text-primary">Перерахунок плану...</span>
                            </div>
                        </div>
                    )}

                    {/* ВСЬОГО */}
                    <div className="mt-4 mb-4">
                        <h2 className="text-xl font-bold text-text-primary mb-4 font-[family-name:var(--font-chakra)] uppercase flex items-center gap-2">
                            <span className="text-2xl">🏭</span> СИМУЛЯТОР БУЛЬВАР-АВТОВОКЗАЛ
                        </h2>
                        <div className="grid gap-6 lg:grid-cols-3">
                            {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
                                const dayPlan = groupedPlan[day] || [];
                                const totalForDay = dayPlan.reduce((sum, item) => sum + item.quantity, 0);

                                return (
                                    <div key={`bulvar-${day}`} className="bg-panel-bg border border-panel-border rounded-2xl shadow-[var(--panel-shadow)] overflow-hidden flex flex-col">
                                        <div className="p-4 border-b border-panel-border bg-bg-primary flex items-center justify-between">
                                            <h3 className="font-bold text-text-primary flex items-center gap-2 font-[family-name:var(--font-chakra)] text-lg uppercase tracking-wide">
                                                <div className="w-7 h-7 rounded-lg bg-accent-primary/10 text-accent-primary border border-accent-primary/30 flex items-center justify-center font-bold text-sm shadow-[var(--panel-shadow)]">
                                                    Д{day}
                                                </div>
                                                Зміна {day}
                                            </h3>
                                            <div className="text-sm font-black text-accent-primary bg-accent-primary/10 px-3 py-1 rounded-full border border-accent-primary/20 shadow-[var(--panel-shadow)] font-[family-name:var(--font-jetbrains)]">
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
                                                                <span className="font-bold text-text-primary text-sm group-hover:text-accent-primary transition-colors leading-tight">{row.product_name}</span>
                                                                <div className="flex items-center gap-2 mt-2 leading-none">
                                                                    <span className="text-[10px] text-text-secondary font-mono tracking-wide px-1.5 py-0.5 rounded bg-panel-border/30 border border-panel-border">R: {row.risk_index}</span>
                                                                </div>
                                                            </div>
                                                            <div className="text-right pl-3 flex-shrink-0">
                                                                <span className="text-lg font-black text-accent-primary tabular-nums font-[family-name:var(--font-chakra)] p-2">{row.quantity}</span>
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
