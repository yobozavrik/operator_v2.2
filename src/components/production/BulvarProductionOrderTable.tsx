'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { ProductionTask } from '@/types/bi';
import { cn } from '@/lib/utils';
import { generateProductionPlanExcel } from '@/lib/order-export';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Activity, Percent, TrendingUp, Calculator, Package, AlertTriangle, ChevronDown, FileSpreadsheet, Loader2 } from 'lucide-react';

interface Props {
    data: ProductionTask[];
    onRefresh: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const BulvarProductionOpsTable = ({ data, onRefresh }: Props) => {
    // 2. State
    const [days, setDays] = useState(1);
    const [isShiftMode, setIsShiftMode] = useState(false);
    const [selectedBulvar, setSelectedBulvar] = useState<string | null>(null);
    const [notification, setNotification] = useState<string | null>(null);

    // 3. Execution State
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isCalculated, setIsCalculated] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [planData, setPlanData] = useState<any[]>([]);

    // 4. Shop Stats
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shopStats } = useSWR<any[]>(
        selectedBulvar ? `/api/bulvar/shop-stats?bulvar=${encodeURIComponent(selectedBulvar)}` : null,
        (url: string) => fetch(url).then(r => r.json())
    );

    const selectedBulvarUnit = React.useMemo(() => {
        if (!selectedBulvar) return 'шт';
        const selectedKey = selectedBulvar.trim().toLowerCase();
        return data.find((item) => item.name.trim().toLowerCase() === selectedKey)?.unit || 'шт';
    }, [data, selectedBulvar]);

    const handleGenerateOrder = async () => {
        setIsLoading(true);
        setPlanData([]);
        setIsCalculated(false);
        setSelectedBulvar(null);

        try {
            const queryParams = new URLSearchParams({
                days: isShiftMode ? '3' : days.toString()
            });

            const response = await fetch(`/api/bulvar/order-plan?${queryParams}`);

            if (!response.ok) throw new Error('API Error');

            const data = await response.json();
            setPlanData(data);
            setIsCalculated(true);

        } catch (error) {
            console.error("Calculation failed:", error);
            alert("Помилка розрахунку");
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportExcel = async () => {
        if (planData.length === 0) return;
        setIsExporting(true);
        try {
            await generateProductionPlanExcel(planData, isShiftMode ? 3 : days);
            setNotification('Файл успішно збережено!');
            setTimeout(() => setNotification(null), 3000);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Помилка експорту');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-bg-primary overflow-hidden font-sans text-text-primary">
            {/* 1. MANAGEMENT BLOCK (Control Panel) */}
            <div className="px-8 py-6 bg-panel-bg border-b border-panel-border shrink-0 relative flex items-center gap-10 z-20 shadow-[var(--panel-shadow)] transition-all">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

                {/* Notification Toast */}
                {notification && (
                    <div className="absolute top-2 right-8 bg-accent-primary/10 text-accent-primary border border-accent-primary/20 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-2 z-30 shadow-[var(--panel-shadow)] backdrop-blur-md">
                        {notification}
                    </div>
                )}

                {/* Days Input Group */}
                <div className="flex items-center gap-4 group/input z-10">
                    <div className="flex flex-col">
                        <label className={cn(
                            "text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 transition-colors text-text-secondary",
                            !isShiftMode && "group-hover/input:text-accent-primary"
                        )}>
                            Планування
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number"
                                min="1"
                                max="30"
                                value={isShiftMode ? 3 : days}
                                disabled={isShiftMode}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (!isNaN(val)) setDays(Math.max(1, val));
                                }}
                                className={cn(
                                    "w-24 h-12 bg-bg-primary border border-panel-border rounded-xl text-center font-mono font-black text-xl text-text-primary focus:outline-none transition-all duration-300",
                                    isShiftMode
                                        ? "border-transparent text-text-muted cursor-not-allowed"
                                        : "focus:border-accent-primary focus:shadow-[var(--panel-shadow)] hover:border-accent-primary/30"
                                )}
                            />
                            <span className={cn(
                                "text-xs font-bold uppercase tracking-widest text-text-secondary",
                                isShiftMode && "text-text-muted"
                            )}>Днів</span>
                        </div>
                    </div>
                </div>

                <div className="h-10 w-px bg-panel-border z-10" />

                {/* 3x3 Toggle Segment */}
                <div className="flex flex-col z-10">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 text-text-secondary">
                        Режим роботи
                    </label>
                    <div
                        onClick={() => setIsShiftMode(!isShiftMode)}
                        className="flex items-center gap-4 cursor-pointer group select-none bg-bg-primary border border-panel-border hover:border-accent-primary/30 px-4 py-2 rounded-xl transition-all h-12"
                    >
                        <div className={cn(
                            "relative w-12 h-6 rounded-full transition-all duration-500",
                            isShiftMode ? "bg-accent-primary shadow-[var(--panel-shadow)]" : "bg-panel-border"
                        )}>
                            <div className={cn(
                                "absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-500 shadow-sm",
                                isShiftMode ? "translate-x-6" : "translate-x-0"
                            )} />
                        </div>
                        <span className={cn(
                            "text-xs font-black uppercase tracking-widest transition-colors",
                            isShiftMode ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"
                        )}>
                            Режим 3х3
                        </span>
                    </div>
                </div>

                <div className="flex-1" />

                {/* EXPORT BUTTON */}
                {isCalculated && (
                    <button
                        onClick={handleExportExcel}
                        disabled={isExporting}
                        className={cn(
                            "relative z-10 flex items-center gap-3 px-6 py-4 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 active:scale-95 text-emerald-500 font-black uppercase tracking-[0.2em] text-xs rounded-2xl transition-all mr-4 disabled:opacity-50 disabled:cursor-not-allowed",
                            isExporting && "animate-pulse"
                        )}
                    >
                        {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={18} strokeWidth={2.5} />}
                        {isExporting ? "Експорт..." : "Excel звір"}
                    </button>
                )}

                {/* Action Button */}
                <button
                    onClick={handleGenerateOrder}
                    disabled={isLoading}
                    className={cn(
                        "relative z-10 group overflow-hidden flex items-center gap-4 px-10 py-4 bg-accent-primary hover:opacity-90 active:scale-95 text-white font-black uppercase tracking-[0.2em] text-sm rounded-2xl transition-all shadow-[var(--panel-shadow)] disabled:opacity-50 disabled:cursor-not-allowed",
                        isLoading && "animate-pulse"
                    )}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-150%] skew-x-[-45deg] group-hover:transition-transform group-hover:duration-700 group-hover:translate-x-[150%]" />
                    <Calculator size={20} strokeWidth={3} />
                    {isLoading ? "Розрахунок..." : "Розрахувати"}
                </button>
            </div>

            {/* 2. RESULTS GRID */}
            <div className="flex-1 overflow-auto bg-bg-primary relative text-text-primary px-8 py-6 custom-scrollbar">

                {/* LOADING / EMPTY STATES */}
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/80 z-30 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-6">
                            <div className="relative">
                                <Calculator className="animate-[spin_3s_linear_infinite] text-accent-primary relative z-10" size={64} />
                                <div className="absolute inset-0 bg-accent-primary/10 blur-xl rounded-full animate-pulse" />
                            </div>
                            <div className="flex flex-col items-center">
                                <span className="text-xl font-black uppercase tracking-[0.3em] text-text-primary">Аналіз даних</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mt-2">Формування оптимального замовлення</span>
                            </div>
                        </div>
                    </div>
                )}

                {!isCalculated && !isLoading && (
                    <div className="h-full flex flex-col items-center justify-center opacity-60 select-none">
                        <div className="w-24 h-24 rounded-full border-2 border-dashed border-panel-border flex items-center justify-center mb-6">
                            <Activity size={40} className="animate-pulse text-text-secondary" />
                        </div>
                        <h3 className="text-lg font-black uppercase tracking-[0.2em] mb-2 text-text-secondary">Готовий до розрахунку</h3>
                        <p className="text-xs font-medium text-text-muted tracking-wider">Оберіть дні та натисніть кнопку "Розрахувати"</p>
                    </div>
                )}

                {/* RESULTS - HORIZONTAL TAPE + FULL GRID LAYOUT */}
                {isCalculated && !isLoading && (
                    <div className="flex flex-col gap-10 pb-10">
                        {Object.entries(planData.reduce((acc, item) => {
                            (acc[item.p_day] = acc[item.p_day] || []).push(item);
                            return acc;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        }, {} as Record<number, any[]>))
                            .sort(([dayA], [dayB]) => Number(dayA) - Number(dayB))
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            .map(([day, items]: [string, any]) => (
                                <div key={day} className="flex flex-col gap-4">
                                    {/* DAY HEADER */}
                                    <div className="flex items-center gap-6 px-2 mb-2">
                                        <div className="px-6 py-2 rounded-xl bg-accent-primary/10 border border-accent-primary/20 text-text-primary text-sm font-black uppercase tracking-[0.3em] shadow-[var(--panel-shadow)] backdrop-blur-sm">
                                            День <span className="text-accent-primary ml-1">{day}</span>
                                        </div>
                                        <div className="h-px bg-gradient-to-r from-accent-primary/50 to-transparent flex-1" />
                                        <div className="text-[10px] text-text-secondary font-black uppercase tracking-[0.2em]">
                                            {items.length} ПРЕДМЕТІВ
                                        </div>
                                    </div>

                                    {/* HORIZONTAL TAPE OF CARDS */}
                                    <div className="flex gap-4 overflow-x-auto pb-6 px-1 custom-scrollbar snap-x">
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        {items.sort((a: any, b: any) => (Number(b.p_avg) || 0) - (Number(a.p_avg) || 0)).map((item: any, idx: number) => {
                                            const isSelected = selectedBulvar === item.p_name;
                                            const pStock = Number(item.p_stock);
                                            const pOrder = Number(item.p_order);
                                            const target = pStock + pOrder;
                                            const percentage = target === 0 ? 100 : Math.min(100, (pStock / target) * 100);

                                            const isCritical = percentage < 60;
                                            const isWarning = percentage >= 60 && percentage < 90;

                                            return (
                                                <div
                                                    key={idx}
                                                    onClick={() => setSelectedBulvar(prev => prev === item.p_name ? null : item.p_name)}
                                                    className={cn(
                                                        "min-w-[280px] snap-start bg-panel-bg backdrop-blur-md border border-panel-border rounded-2xl transition-all duration-300 cursor-pointer select-none group/card relative overflow-hidden shadow-[var(--panel-shadow)]",
                                                        isSelected
                                                            ? "ring-2 ring-accent-primary border-accent-primary scale-[1.02]"
                                                            : "hover:border-accent-primary/30 hover:shadow-[var(--panel-shadow-strong)]"
                                                    )}
                                                >
                                                    {isSelected && <div className="absolute inset-0 bg-accent-primary/5 pointer-events-none" />}

                                                    {/* Status Indicator Bar */}
                                                    <div className={cn(
                                                        "h-1 w-full relative",
                                                        isCritical ? "bg-[#FF6B6B]" :
                                                            isWarning ? "bg-[#FFB800]" :
                                                                "bg-emerald-500"
                                                    )}>
                                                        <div className={cn(
                                                            "absolute inset-0 blur-sm",
                                                            isCritical ? "bg-[#FF6B6B]" :
                                                                isWarning ? "bg-[#FFB800]" :
                                                                    "bg-emerald-500"
                                                        )} />
                                                    </div>

                                                    <div className="p-4 relative z-10">
                                                        <div className="flex items-start justify-between gap-3 mb-4">
                                                            <h4 className="text-[11px] font-black text-text-primary leading-tight tracking-tight uppercase group-hover/card:text-accent-primary transition-colors truncate" title={item.p_name}>
                                                                {item.p_name}
                                                            </h4>
                                                            {isCritical && <AlertTriangle size={14} className="text-red-500 shrink-0" />}
                                                        </div>

                                                        <div className="flex items-end justify-between mb-4">
                                                            <div className="flex flex-col">
                                                                <span className="text-[8px] font-black text-text-secondary uppercase tracking-[0.15em] mb-0.5">ЗАМОВЛЕННЯ</span>
                                                                <div className="flex items-baseline gap-1">
                                                                    <span className={cn(
                                                                        "text-3xl font-black font-mono leading-none tracking-tighter",
                                                                        pOrder > 0 ? "text-accent-primary" : "text-text-muted"
                                                                    )}>
                                                                        {pOrder.toFixed(0)}
                                                                    </span>
                                                                    <span className="text-[10px] font-black text-accent-primary/70 uppercase">{item.unit || 'шт'}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[8px] font-black text-text-secondary uppercase tracking-[0.15em] mb-0.5">ФАКТ</span>
                                                                <span className={cn(
                                                                    "text-lg font-black font-mono leading-none",
                                                                    isCritical ? "text-red-500" :
                                                                        isWarning ? "text-amber-500" :
                                                                            "text-emerald-500"
                                                                )}>
                                                                    {pStock.toFixed(0)}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="relative h-1.5 bg-bg-primary rounded-full overflow-hidden mb-3 border border-panel-border">
                                                            <div
                                                                className={cn(
                                                                    "h-full rounded-full transition-all duration-1000 relative",
                                                                    isCritical ? "bg-red-500" :
                                                                        isWarning ? "bg-amber-500" :
                                                                            "bg-emerald-500"
                                                                )}
                                                                style={{ width: `${percentage}%` }}
                                                            >
                                                                <div className="absolute inset-0 bg-white/20 w-1/2 skew-x-[-20deg] animate-[shimmer_2s_infinite]" />
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between text-[9px] font-bold text-text-secondary uppercase tracking-widest pt-1 border-t border-panel-border">
                                                            <div className="flex gap-3">
                                                                <span>Мін <span className="text-text-primary font-mono ml-0.5">{Number(item.p_min).toFixed(0)}</span></span>
                                                                <span>Сер <span className="text-text-primary font-mono ml-0.5">{Number(item.p_avg).toFixed(1)}</span></span>
                                                            </div>
                                                            <ChevronDown size={12} className={cn("transition-transform duration-500", isSelected && "rotate-180 text-accent-primary")} />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* FULL GRID ANALYTICS (Appears when a bulvar is selected) */}
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    {selectedBulvar && items.some((i: any) => i.p_name === selectedBulvar) && (
                                        <div className="mt-2 bg-panel-bg backdrop-blur-xl border border-panel-border rounded-3xl p-8 animate-in fade-in slide-in-from-top-4 duration-500 shadow-[var(--panel-shadow-strong)] relative overflow-hidden">
                                            <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

                                            <div className="flex items-baseline justify-between mb-8 pb-4 border-b border-panel-border relative z-10">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-2 h-8 bg-accent-primary rounded-full" />
                                                    <h3 className="text-xl font-black uppercase tracking-[0.2em] text-text-primary">
                                                        Аналітика: <span className="text-accent-primary">{selectedBulvar}</span>
                                                    </h3>
                                                </div>
                                                <div className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em]">
                                                    {shopStats?.length || 0} ТОЧОК ПРОДАЖУ ТА ПРІОРИТЕТІВ
                                                </div>
                                            </div>

                                            {!shopStats ? (
                                                <div className="py-20 flex flex-col items-center gap-6 relative z-10">
                                                    <div className="relative">
                                                        <Activity className="animate-spin text-accent-primary relative z-10" size={48} />
                                                        <div className="absolute inset-0 bg-accent-primary/10 blur-xl rounded-full animate-pulse" />
                                                    </div>
                                                    <span className="text-xs font-black uppercase tracking-[0.3em] text-accent-primary/60">Отримання даних по магазинах...</span>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 relative z-10">
                                                    {[...shopStats]
                                                        .sort((a, b) => (b.avg_sales_day || 0) - (a.avg_sales_day || 0))
                                                        .map((stat, sIdx) => {
                                                            const isDeficit = (stat.stock_now || 0) <= (stat.min_stock || 0);
                                                            const need = Math.max(0, Math.ceil((stat.avg_sales_day * days) + (stat.min_stock || 0) - (stat.stock_now || 0)));

                                                            return (
                                                                <div key={sIdx} className={cn(
                                                                    "rounded-2xl p-5 border transition-all duration-300 flex flex-col justify-between group/shop relative overflow-hidden backdrop-blur-sm shadow-[var(--panel-shadow)]",
                                                                    isDeficit
                                                                        ? "bg-red-50 border-red-200"
                                                                        : "bg-panel-bg border-panel-border hover:border-accent-primary/30"
                                                                )}>
                                                                    {isDeficit && <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 to-transparent pointer-events-none" />}

                                                                    <div className="flex flex-col mb-4 relative z-10">
                                                                        <h5 className="text-xs font-black uppercase tracking-tight text-text-primary group-hover/shop:text-accent-primary transition-colors mb-2 truncate" title={stat.spot_name}>
                                                                            {stat.spot_name}
                                                                        </h5>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[9px] font-black text-text-secondary uppercase tracking-widest">СЕР.ПРОДАЖІ:</span>
                                                                            <span className="text-sm font-mono font-black text-accent-primary">
                                                                                {Number(stat.avg_sales_day || 0).toFixed(1)}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center justify-between pt-4 border-t border-panel-border relative z-10">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-[8px] font-black text-text-secondary uppercase mb-1">ФАКТ / МІН</span>
                                                                            <div className="flex items-baseline gap-1.5">
                                                                                <span className={cn("text-xl font-mono font-black leading-none", isDeficit ? "text-red-500" : "text-emerald-500")}>
                                                                                    {stat.stock_now || 0}
                                                                                </span>
                                                                                <span className="text-[10px] font-mono font-bold text-text-muted">/ {stat.min_stock || 0}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex flex-col items-end">
                                                                            <span className="text-[8px] font-black text-accent-primary/60 uppercase mb-1">ТРЕБА</span>
                                                                            <span className="text-2xl font-mono font-black text-accent-primary leading-none">
                                                                                {need.toFixed(0)}
                                                                                <span className="text-[10px] opacity-70 ml-1 font-sans text-text-secondary">{selectedBulvarUnit}</span>
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    {isDeficit && (
                                                                        <div className="absolute top-2 right-2">
                                                                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                    </div>
                )}
            </div>
        </div>
    );
};
