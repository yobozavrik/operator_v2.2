'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Settings2, TrendingUp, AlertTriangle, Loader2 } from 'lucide-react';

interface PlanItem {
    plan_day: number;
    product_name: string;
    quantity: number;
    risk_index: number;
    prod_rank: number;
    plan_metadata: {
        deficit: number;
        avg_sales: number;
        category?: string;
    };
}

export default function KonditerkaProductionSimulator() {
    const [capacity, setCapacity] = useState(320);
    const [days, setDays] = useState<number>(3);
    const [planData, setPlanData] = useState<PlanItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchPlan = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch(
                    `/api/konditerka/simulator-plan?days=${encodeURIComponent(String(days))}&capacity=${encodeURIComponent(String(capacity))}`,
                    { credentials: 'include' }
                );
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const message =
                        (payload && typeof payload.error === 'string' && payload.error) ||
                        `HTTP ${response.status}`;
                    throw new Error(message);
                }
                setPlanData(Array.isArray(payload) ? (payload as PlanItem[]) : []);
            } catch (err: unknown) {
                console.error('Error fetching plan:', err);
                const message = err instanceof Error ? err.message : String(err);
                setError(message || 'Unknown error');
                setPlanData([]);
            } finally {
                setIsLoading(false);
            }
        };

        const timer = setTimeout(() => {
            fetchPlan();
        }, 600);

        return () => clearTimeout(timer);
    }, [capacity, days]);

    // Group by day and category
    const groupedPlan = useMemo(() => {
        const groups: Record<number, { desserts: PlanItem[], morozivo: PlanItem[] }> = {};

        for (let i = 1; i <= days; i++) {
            groups[i] = { desserts: [], morozivo: [] };
        }

        planData.forEach(row => {
            if (!groups[row.plan_day]) return;
            const category = row.plan_metadata?.category;
            if (category === 'Морозиво') {
                groups[row.plan_day].morozivo.push(row);
            } else {
                groups[row.plan_day].desserts.push(row);
            }
        });

        return groups;
    }, [planData, days]);

    return (
        <div className="h-full bg-bg-primary p-4 md:p-8 font-sans text-text-primary overflow-y-auto custom-scrollbar">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Capacity Control Panel */}
                <div className="bg-panel-bg border border-panel-border rounded-2xl shadow-[var(--panel-shadow)] p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                        <div>
                            <h2 className="text-xl font-bold text-text-primary flex items-center gap-2 font-[family-name:var(--font-chakra)] uppercase tracking-wide">
                                <Settings2 className="w-6 h-6 text-[#00E0FF]" />
                                Симулятор Виробництва (План на {days} дні)
                            </h2>
                            <p className="text-sm text-text-secondary mt-1 font-[family-name:var(--font-jetbrains)]">
                                Налаштуйте ліміт потужності, щоб побачити перерахунок для Десертів та Морозива
                            </p>
                        </div>
                        <div className="text-left md:text-right">
                            <span className="text-4xl font-black text-[#00E0FF] font-[family-name:var(--font-chakra)] drop-shadow-[0_0_10px_rgba(0,224,255,0.3)]">
                                {capacity} <span className="text-lg text-text-secondary font-medium font-sans">од.</span>
                            </span>
                        </div>
                    </div>

                    <div className="relative pt-2">
                        <input
                            type="range"
                            min="100"
                            max="800"
                            step="20"
                            value={capacity}
                            onChange={(e) => setCapacity(Number(e.target.value))}
                            className="w-full h-2 bg-panel-border rounded-full appearance-none cursor-pointer accent-[#00E0FF] focus:outline-none focus:ring-2 focus:ring-[#00E0FF]"
                        />
                        <div className="flex justify-between text-[11px] text-text-secondary mt-3 font-bold px-1 uppercase tracking-widest font-[family-name:var(--font-jetbrains)]">
                            <span>100 (Мін)</span>
                            <span className="text-[#00E0FF] font-black drop-shadow-[0_0_5px_rgba(0,224,255,0.5)]">320 (Норма)</span>
                            <span>800 (Макс)</span>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-5 border-t border-panel-border mt-5">
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

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3 text-red-400 font-[family-name:var(--font-jetbrains)] backdrop-blur-sm">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <span className="font-bold text-sm">Помилка: {error}</span>
                    </div>
                )}

                <div className="space-y-12 relative min-h-[400px]">
                    {isLoading && (
                        <div className="absolute inset-0 z-10 bg-bg-primary/60 backdrop-blur-[2px] rounded-2xl flex items-center justify-center transition-all duration-300">
                            <div className="flex flex-col items-center gap-3 text-orange-500 bg-panel-bg px-8 py-6 rounded-2xl shadow-[var(--panel-shadow)] border border-panel-border">
                                <Loader2 className="w-8 h-8 animate-spin" />
                                <span className="text-xs font-bold tracking-widest uppercase font-[family-name:var(--font-jetbrains)] text-text-primary">Перерахунок плану...</span>
                            </div>
                        </div>
                    )}

                    {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
                        const dayPlan = groupedPlan[day] || { desserts: [], morozivo: [] };
                        const totalDesserts = dayPlan.desserts.reduce((sum, item) => sum + item.quantity, 0);
                        const totalMorozivo = dayPlan.morozivo.reduce((sum, item) => sum + item.quantity, 0);

                        return (
                            <div key={day} className="space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00E0FF] to-[#00A3FF] flex items-center justify-center text-white font-black text-xl shadow-[0_4px_15px_rgba(0,224,255,0.3)]">
                                        Д{day}
                                    </div>
                                    <h3 className="text-2xl font-black text-white font-[family-name:var(--font-chakra)] uppercase tracking-wider">
                                        Зміна {day}
                                    </h3>
                                    <div className="h-px flex-1 bg-gradient-to-r from-panel-border to-transparent" />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    {/* Column 1: Desserts */}
                                    <div className="bg-panel-bg border border-panel-border rounded-2xl shadow-[var(--panel-shadow)] overflow-hidden">
                                        <div className="p-4 border-b border-panel-border bg-[#131B2C]/50 flex items-center justify-between">
                                            <h4 className="font-bold text-text-primary flex items-center gap-2 font-[family-name:var(--font-chakra)] text-base uppercase tracking-wide">
                                                🍰 ДЕСЕРТИ (КОНДИТЕРКА)
                                            </h4>
                                            <div className="text-xs font-black text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20">
                                                {totalDesserts} од.
                                            </div>
                                        </div>
                                        <div className="p-2 max-h-[500px] overflow-y-auto custom-scrollbar">
                                            {dayPlan.desserts.length === 0 ? (
                                                <div className="flex items-center justify-center h-20 text-text-muted text-[10px] uppercase tracking-widest font-bold">Немає призначень</div>
                                            ) : (
                                                <ul className="space-y-1">
                                                    {dayPlan.desserts.map((row, idx) => (
                                                        <RenderPlanRow key={idx} row={row} />
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>

                                    {/* Column 2: Morozivo */}
                                    <div className="bg-panel-bg border border-panel-border rounded-2xl shadow-[var(--panel-shadow)] overflow-hidden">
                                        <div className="p-4 border-b border-panel-border bg-[#131B2C]/50 flex items-center justify-between">
                                            <h4 className="font-bold text-text-primary flex items-center gap-2 font-[family-name:var(--font-chakra)] text-base uppercase tracking-wide">
                                                🍦 МОРОЗИВО ТА СОРБЕТИ
                                            </h4>
                                            <div className="text-xs font-black text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                                                {totalMorozivo} шт.
                                            </div>
                                        </div>
                                        <div className="p-2 max-h-[500px] overflow-y-auto custom-scrollbar">
                                            {dayPlan.morozivo.length === 0 ? (
                                                <div className="flex items-center justify-center h-20 text-text-muted text-[10px] uppercase tracking-widest font-bold">Немає призначень</div>
                                            ) : (
                                                <ul className="space-y-1">
                                                    {dayPlan.morozivo.map((row, idx) => (
                                                        <RenderPlanRow key={idx} row={row} />
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

            </div>
        </div>
    );
}

function RenderPlanRow({ row }: { row: PlanItem }) {
    return (
        <li className="flex items-center justify-between p-3 rounded-xl hover:bg-bg-primary transition-colors border border-transparent hover:border-panel-border group">
            <div className="flex flex-col">
                <span className="font-bold text-text-primary text-sm group-hover:text-[#00E0FF] transition-colors leading-tight">
                    {row.product_name}
                </span>
                <div className="flex items-center gap-2 mt-2 leading-none">
                    <span className="text-[10px] text-text-secondary font-mono tracking-wide px-1.5 py-0.5 rounded bg-panel-border/30 border border-panel-border">
                        R: {row.risk_index}
                    </span>
                    {row.plan_metadata?.avg_sales > 0 && (
                        <span className="text-[9px] text-emerald-400/80 uppercase font-bold">
                            Avg: {Number(row.plan_metadata.avg_sales).toFixed(1)}/d
                        </span>
                    )}
                </div>
            </div>
            <div className="text-right pl-3 flex-shrink-0">
                <span className="text-lg font-black text-[#00E0FF] tabular-nums font-[family-name:var(--font-chakra)]">
                    {row.quantity}
                </span>
            </div>
        </li>
    );
}
