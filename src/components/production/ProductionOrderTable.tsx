'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { ProductionTask } from '@/types/bi';
import { cn } from '@/lib/utils';
import { generateProductionPlanExcel } from '@/lib/order-export';
import { Activity, Calculator, AlertTriangle, ChevronDown, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    data: ProductionTask[];
    onRefresh: () => void;
}

export const ProductionOpsTable = ({ data, onRefresh }: Props) => {
    // 2. State
    const [days, setDays] = useState(1);
    const [isShiftMode, setIsShiftMode] = useState(false);
    const [selectedPizza, setSelectedPizza] = useState<string | null>(null);
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
        selectedPizza ? `/api/pizza/shop-stats?pizza=${encodeURIComponent(selectedPizza)}` : null,
        (url: string) => fetch(url).then(r => r.json())
    );

    const handleGenerateOrder = async () => {
        setIsLoading(true);
        setPlanData([]);
        setIsCalculated(false);
        setSelectedPizza(null);

        try {
            const queryParams = new URLSearchParams({
                days: isShiftMode ? '3' : days.toString()
            });

            const response = await fetch(`/api/pizza/order-plan?${queryParams}`);

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
            <div className="px-8 py-6 bg-panel-bg border-b border-panel-border shrink-0 relative flex items-center gap-10 z-20 shadow-sm transition-all">
                {/* Subtle grid pattern for the top bar */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.01)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

                {/* Notification Toast */}
                <AnimatePresence>
                    {notification && (
                        <motion.div 
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="absolute top-2 right-8 bg-blue-500/10 text-blue-600 border border-blue-500/20 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest z-30 shadow-md backdrop-blur-md"
                        >
                            {notification}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Days Input Group */}
                <div className="flex items-center gap-4 group/input z-10">
                    <div className="flex flex-col">
                        <label className={cn(
                            "text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 transition-colors",
                            isShiftMode ? "text-slate-300" : "text-slate-400 group-hover/input:text-blue-500"
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
                                    "w-24 h-12 bg-slate-50 border border-slate-200 rounded-xl text-center font-mono font-black text-xl text-slate-900 focus:outline-none transition-all duration-300",
                                    isShiftMode
                                        ? "border-transparent text-slate-300 cursor-not-allowed"
                                        : "focus:border-blue-500 focus:shadow-[0_0_15px_rgba(59,130,246,0.1)] hover:border-slate-300 shadow-inner"
                                )}
                            />
                            <span className={cn(
                                "text-xs font-bold uppercase tracking-widest",
                                isShiftMode ? "text-slate-300" : "text-slate-500"
                            )}>Днів</span>
                        </div>
                    </div>
                </div>

                <div className="h-10 w-px bg-slate-200 z-10" />

                {/* 3x3 Toggle Segment */}
                <div className="flex flex-col z-10">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 text-slate-400">
                        Режим роботи
                    </label>
                    <div
                        onClick={() => setIsShiftMode(!isShiftMode)}
                        className="flex items-center gap-4 cursor-pointer group select-none bg-slate-50 border border-slate-200 hover:border-slate-300 px-4 py-2 rounded-xl transition-all h-12 shadow-inner"
                    >
                        <div className={cn(
                            "relative w-12 h-6 rounded-full transition-all duration-500",
                            isShiftMode ? "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]" : "bg-slate-200"
                        )}>
                            <div className={cn(
                                "absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-500 shadow-sm",
                                isShiftMode ? "translate-x-6" : "translate-x-0"
                            )} />
                        </div>
                        <span className={cn(
                            "text-xs font-black uppercase tracking-widest transition-colors",
                            isShiftMode ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"
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
                            "relative z-10 flex items-center gap-3 px-6 py-4 bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 active:scale-95 font-black uppercase tracking-[0.2em] text-xs rounded-2xl transition-all mr-4 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
                            isExporting && "animate-pulse"
                        )}
                    >
                        {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={18} strokeWidth={2.5} />}
                        {isExporting ? "Експорт..." : "Excel звіт"}
                    </button>
                )}

                {/* Action Button */}
                <button
                    onClick={handleGenerateOrder}
                    disabled={isLoading}
                    className={cn(
                        "relative z-10 group overflow-hidden flex items-center gap-4 px-10 py-4 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white font-black uppercase tracking-[0.2em] text-sm rounded-2xl transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed",
                        isLoading && "animate-pulse"
                    )}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-150%] skew-x-[-45deg] group-hover:transition-transform group-hover:duration-700 group-hover:translate-x-[150%]" />
                    <Calculator size={20} strokeWidth={3} />
                    {isLoading ? "Розрахунок..." : "Розрахувати"}
                </button>
            </div>

            {/* 2. RESULTS GRID */}
            <div className="flex-1 overflow-auto bg-slate-50/50 relative text-text-primary px-8 py-6 custom-scrollbar">

                {/* LOADING / EMPTY STATES */}
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-30 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-6">
                            <div className="relative">
                                <Calculator className="animate-[spin_3s_linear_infinite] text-blue-500 relative z-10 drop-shadow-[0_0_15px_rgba(59,130,246,0.2)]" size={64} />
                            </div>
                            <div className="flex flex-col items-center">
                                <span className="text-xl font-black uppercase tracking-[0.3em] text-slate-900">Аналіз даних</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500/60 mt-2">Формування оптимального замовлення</span>
                            </div>
                        </div>
                    </div>
                )}

                {!isCalculated && !isLoading && (
                    <div className="h-full flex flex-col items-center justify-center opacity-40 select-none">
                        <div className="w-24 h-24 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center mb-6">
                            <Activity size={40} className="animate-pulse text-slate-400" />
                        </div>
                        <h3 className="text-lg font-black uppercase tracking-[0.2em] mb-2 text-slate-900">Готовий до розрахунку</h3>
                        <p className="text-xs font-medium text-slate-500 tracking-wider">Оберіть дні та натисніть кнопку "Розрахувати"</p>
                    </div>
                )}

                {/* RESULTS - HORIZONTAL TAPE + FULL GRID LAYOUT */}
                {isCalculated && !isLoading && (
                    <div className="flex flex-col gap-10 pb-10">
                        {Object.entries(planData.reduce((acc, item) => {
                            (acc[item.p_day] = acc[item.p_day] || []).push(item);
                            return acc;
                        }, {} as Record<number, any[]>))
                            .sort(([dayA], [dayB]) => Number(dayA) - Number(dayB))
                            .map(([day, items]: [string, any]) => (
                                <div key={day} className="flex flex-col gap-4">
                                    {/* DAY HEADER */}
                                    <div className="flex items-center gap-6 px-2 mb-2">
                                        <div className="px-6 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 text-sm font-black uppercase tracking-[0.3em] shadow-sm backdrop-blur-sm">
                                            День <span className="text-blue-500 ml-1 underline decoration-2 underline-offset-4">{day}</span>
                                        </div>
                                        <div className="h-px bg-gradient-to-r from-slate-200 via-slate-200 to-transparent flex-1" />
                                        <div className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                                            {items.length} ПРЕДМЕТІВ
                                        </div>
                                    </div>

                                    {/* HORIZONTAL TAPE OF CARDS */}
                                    <div className="flex gap-4 overflow-x-auto pb-6 px-1 custom-scrollbar snap-x">
                                        {items.sort((a: any, b: any) => (Number(b.p_avg) || 0) - (Number(a.p_avg) || 0)).map((item: any, idx: number) => {
                                            const isSelected = selectedPizza === item.p_name;
                                            const pStock = Number(item.p_stock);
                                            const pOrder = Number(item.p_order);
                                            const target = pStock + pOrder;
                                            const percentage = target === 0 ? 100 : Math.min(100, (pStock / target) * 100);

                                            const isCritical = percentage < 60;
                                            const isWarning = percentage >= 60 && percentage < 90;

                                            return (
                                                <motion.div
                                                    layout
                                                    key={idx}
                                                    onClick={() => setSelectedPizza(prev => prev === item.p_name ? null : item.p_name)}
                                                    className={cn(
                                                        "min-w-[280px] snap-start bg-white border rounded-2xl transition-all duration-300 cursor-pointer select-none group/card relative overflow-hidden shadow-sm",
                                                        isSelected
                                                            ? "ring-2 ring-blue-500 border-blue-500 shadow-lg scale-[1.02]"
                                                            : "border-slate-200 hover:border-blue-400/50 hover:shadow-md"
                                                    )}
                                                >
                                                    {isSelected && <div className="absolute inset-0 bg-blue-500/5 pointer-events-none" />}

                                                    {/* Status Indicator Bar */}
                                                    <div className={cn(
                                                        "h-1 w-full relative",
                                                        isCritical ? "bg-rose-500" :
                                                            isWarning ? "bg-amber-500" :
                                                                "bg-emerald-500"
                                                    )} />

                                                    <div className="p-4 relative z-10">
                                                        <div className="flex items-start justify-between gap-3 mb-4">
                                                            <h4 className="text-[11px] font-black text-slate-800 leading-tight tracking-tight uppercase group-hover/card:text-blue-600 transition-colors truncate" title={item.p_name}>
                                                                {item.p_name}
                                                            </h4>
                                                            {isCritical && <AlertTriangle size={14} className="text-rose-500 shrink-0" />}
                                                        </div>

                                                        <div className="flex items-end justify-between mb-4">
                                                            <div className="flex flex-col">
                                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.15em] mb-0.5">ЗАМОВЛЕННЯ</span>
                                                                <div className="flex items-baseline gap-1">
                                                                    <span className={cn(
                                                                        "text-3xl font-black font-mono leading-none tracking-tighter",
                                                                        pOrder > 0 ? "text-blue-500 shadow-sm" : "text-slate-200"
                                                                    )}>
                                                                        {pOrder.toFixed(0)}
                                                                    </span>
                                                                    <span className="text-[10px] font-black text-blue-500/50 uppercase">шт</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.15em] mb-0.5">ФАКТ</span>
                                                                <span className={cn(
                                                                    "text-lg font-black font-mono leading-none",
                                                                    isCritical ? "text-rose-500" :
                                                                        isWarning ? "text-amber-500" :
                                                                            "text-emerald-600"
                                                                )}>
                                                                    {pStock.toFixed(0)}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="relative h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3 border border-slate-200/50">
                                                            <div
                                                                className={cn(
                                                                    "h-full rounded-full transition-all duration-1000 relative",
                                                                    isCritical ? "bg-rose-500" :
                                                                        isWarning ? "bg-amber-500" :
                                                                            "bg-emerald-500"
                                                                )}
                                                                style={{ width: `${percentage}%` }}
                                                            >
                                                                <div className="absolute inset-0 bg-white/30 w-1/2 skew-x-[-20deg] animate-[shimmer_2s_infinite]" />
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-1 border-t border-slate-100">
                                                            <div className="flex gap-3">
                                                                <span>Мін <span className="text-slate-900 font-mono ml-0.5">{Number(item.p_min).toFixed(0)}</span></span>
                                                                <span>Сер <span className="text-slate-900 font-mono ml-0.5">{Number(item.p_avg).toFixed(1)}</span></span>
                                                            </div>
                                                            <ChevronDown size={12} className={cn("transition-transform duration-500 text-slate-400", isSelected && "rotate-180 text-blue-500")} />
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>

                                    {/* FULL GRID ANALYTICS (Appears when a pizza is selected) */}
                                    <AnimatePresence>
                                        {selectedPizza && items.some((i: any) => i.p_name === selectedPizza) && (
                                            <motion.div 
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-2 bg-white border border-blue-500/20 rounded-3xl p-8 shadow-xl relative overflow-hidden"
                                            >
                                                {/* Decorative grid pattern */}
                                                <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

                                                <div className="flex items-baseline justify-between mb-8 pb-4 border-b border-slate-100 relative z-10">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-2 h-8 bg-blue-500 rounded-full shadow-sm" />
                                                        <h3 className="text-xl font-black uppercase tracking-[0.2em] text-slate-900">
                                                            Аналітика: <span className="text-blue-500">{selectedPizza}</span>
                                                        </h3>
                                                    </div>
                                                    <div className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">
                                                        {shopStats?.length || 0} ТОЧОК ПРОДАЖУ ТА ПРІОРИТЕТІВ
                                                    </div>
                                                </div>

                                                {!shopStats ? (
                                                    <div className="py-20 flex flex-col items-center gap-6 relative z-10">
                                                        <Activity className="animate-spin text-blue-500" size={48} />
                                                        <span className="text-xs font-black uppercase tracking-[0.3em] text-blue-500/60">Отримання даних по магазинах...</span>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 relative z-10 text-white">
                                                        {[...shopStats]
                                                            .sort((a, b) => (b.avg_sales_day || 0) - (a.avg_sales_day || 0))
                                                            .map((stat, sIdx) => {
                                                                const isDeficit = (stat.stock_now || 0) <= (stat.min_stock || 0);
                                                                const need = Math.max(0, Math.ceil((stat.avg_sales_day * days) + (stat.min_stock || 0) - (stat.stock_now || 0)));

                                                                return (
                                                                    <div key={sIdx} className={cn(
                                                                        "rounded-2xl p-5 border transition-all duration-300 flex flex-col justify-between group/shop relative overflow-hidden backdrop-blur-sm shadow-sm",
                                                                        isDeficit
                                                                            ? "bg-rose-50 border-rose-200"
                                                                            : "bg-white border-slate-100 hover:border-blue-200 hover:bg-blue-50/30"
                                                                    )}>
                                                                        {isDeficit && <div className="absolute inset-x-0 top-0 h-1 bg-rose-500 pointer-events-none" />}

                                                                        <div className="flex flex-col mb-4 relative z-10">
                                                                            <h5 className="text-xs font-black uppercase tracking-tight text-slate-800 group-hover/shop:text-blue-600 transition-colors mb-2 truncate" title={stat.spot_name}>
                                                                                {stat.spot_name}
                                                                            </h5>
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">СЕР.ПРОДАЖІ:</span>
                                                                                <span className="text-sm font-mono font-black text-blue-500">
                                                                                    {Number(stat.avg_sales_day || 0).toFixed(1)}
                                                                                </span>
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex items-end justify-between pt-4 border-t border-slate-100 relative z-10">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[8px] font-black text-slate-400 uppercase mb-1">ФАКТ</span>
                                                                                <span className={cn("text-xl font-mono font-black leading-none", isDeficit ? "text-rose-500" : "text-emerald-600")}>
                                                                                    {stat.stock_now || 0}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex flex-col items-end">
                                                                                <span className="text-[8px] font-black text-blue-500/50 uppercase mb-1">ТРЕБА</span>
                                                                                <span className="text-2xl font-mono font-black text-blue-500 leading-none">
                                                                                    {need.toFixed(0)}
                                                                                </span>
                                                                            </div>
                                                                        </div>

                                                                        {isDeficit && (
                                                                            <div className="absolute top-2 right-2">
                                                                                <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse shadow-sm" />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ))}
                    </div>
                )}
            </div>
        </div>
    );
};
