'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { ProductionTask } from '@/types/bi';
import { cn } from '@/lib/utils';
import { generateProductionPlanExcel } from '@/lib/order-export';
import { getKonditerkaUnit } from '@/lib/konditerka-dictionary';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Activity, Percent, TrendingUp, Calculator, Package, AlertTriangle, ChevronDown, FileSpreadsheet, Loader2 } from 'lucide-react';

interface Props {
    data: ProductionTask[];
    onRefresh: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const KonditerkaProductionOpsTable = ({ data, onRefresh }: Props) => {
    // 2. State
    const [days, setDays] = useState(1);
    const [isShiftMode, setIsShiftMode] = useState(false);
    const [selectedKonditerka, setSelectedKonditerka] = useState<string | null>(null);
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
        selectedKonditerka ? `/api/konditerka/shop-stats?konditerka=${encodeURIComponent(selectedKonditerka)}` : null,
        (url: string) => fetch(url).then(r => r.json())
    );

    const handleGenerateOrder = async () => {
        setIsLoading(true);
        setPlanData([]);
        setIsCalculated(false);
        setSelectedKonditerka(null);

        try {
            const queryParams = new URLSearchParams({
                days: isShiftMode ? '3' : days.toString()
            });

            const response = await fetch(`/api/konditerka/order-plan?${queryParams}`);

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
        <div className="h-full flex flex-col bg-[#0B0E14] overflow-hidden font-sans">
            {/* 1. MANAGEMENT BLOCK (Control Panel) */}
            <div className="px-8 py-6 bg-[#141829] border-b border-white/5 shrink-0 relative flex items-center gap-10 z-20 shadow-[0_4px_20px_rgba(0,0,0,0.5)] transition-all">
                {/* Subtle grid pattern for the top bar */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

                {/* Notification Toast */}
                {notification && (
                    <div className="absolute top-2 right-8 bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-2 z-30 shadow-[0_0_15px_rgba(0,212,255,0.3)] backdrop-blur-md">
                        {notification}
                    </div>
                )}

                {/* Days Input Group */}
                <div className="flex items-center gap-4 group/input z-10">
                    <div className="flex flex-col">
                        <label className={cn(
                            "text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 transition-colors",
                            isShiftMode ? "text-white/20" : "text-white/40 group-hover/input:text-[#00D4FF]"
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
                                    "w-24 h-12 bg-[#0B0E14] border border-white/10 rounded-xl text-center font-mono font-black text-xl text-white focus:outline-none transition-all duration-300",
                                    isShiftMode
                                        ? "border-transparent text-white/20 cursor-not-allowed"
                                        : "focus:border-[#00D4FF] focus:shadow-[0_0_15px_rgba(0,212,255,0.3)] hover:border-white/20 shadow-inner"
                                )}
                            />
                            <span className={cn(
                                "text-xs font-bold uppercase tracking-widest",
                                isShiftMode ? "text-white/20" : "text-white/40"
                            )}>Днів</span>
                        </div>
                    </div>
                </div>

                <div className="h-10 w-px bg-white/10 z-10" />

                {/* 3x3 Toggle Segment */}
                <div className="flex flex-col z-10">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 text-white/40">
                        Режим роботи
                    </label>
                    <div
                        onClick={() => setIsShiftMode(!isShiftMode)}
                        className="flex items-center gap-4 cursor-pointer group select-none bg-[#0B0E14] border border-white/10 hover:border-white/20 px-4 py-2 rounded-xl transition-all h-12 shadow-inner"
                    >
                        <div className={cn(
                            "relative w-12 h-6 rounded-full transition-all duration-500",
                            isShiftMode ? "bg-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.5)]" : "bg-white/10"
                        )}>
                            <div className={cn(
                                "absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-500 shadow-sm",
                                isShiftMode ? "translate-x-6" : "translate-x-0"
                            )} />
                        </div>
                        <span className={cn(
                            "text-xs font-black uppercase tracking-widest transition-colors",
                            isShiftMode ? "text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]" : "text-white/40 group-hover:text-white/60"
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
                            "relative z-10 flex items-center gap-3 px-6 py-4 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 active:scale-95 text-emerald-400 font-black uppercase tracking-[0.2em] text-xs rounded-2xl transition-all mr-4 disabled:opacity-50 disabled:cursor-not-allowed",
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
                        "relative z-10 group overflow-hidden flex items-center gap-4 px-10 py-4 bg-[#00D4FF] hover:bg-[#33DDFF] active:scale-95 text-[#0B0E14] font-black uppercase tracking-[0.2em] text-sm rounded-2xl transition-all shadow-[0_0_20px_rgba(0,212,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed",
                        isLoading && "animate-pulse"
                    )}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-150%] skew-x-[-45deg] group-hover:transition-transform group-hover:duration-700 group-hover:translate-x-[150%]" />
                    <Calculator size={20} strokeWidth={3} />
                    {isLoading ? "Розрахунок..." : "Розрахувати"}
                </button>
            </div>

            {/* 2. RESULTS GRID */}
            <div className="flex-1 overflow-auto bg-[#0B0E14] relative text-white px-8 py-6 custom-scrollbar">

                {/* LOADING / EMPTY STATES */}
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#0B0E14]/80 z-30 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-6">
                            <div className="relative">
                                <Calculator className="animate-[spin_3s_linear_infinite] text-[#00D4FF] relative z-10 drop-shadow-[0_0_15px_rgba(0,212,255,0.8)]" size={64} />
                                <div className="absolute inset-0 bg-[#00D4FF]/20 blur-xl rounded-full animate-pulse" />
                            </div>
                            <div className="flex flex-col items-center">
                                <span className="text-xl font-black uppercase tracking-[0.3em] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">Аналіз даних</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-[#00D4FF]/60 mt-2">Формування оптимального замовлення</span>
                            </div>
                        </div>
                    </div>
                )}

                {!isCalculated && !isLoading && (
                    <div className="h-full flex flex-col items-center justify-center opacity-60 select-none">
                        <div className="w-24 h-24 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center mb-6">
                            <Activity size={40} className="animate-pulse text-white/40" />
                        </div>
                        <h3 className="text-lg font-black uppercase tracking-[0.2em] mb-2 text-white/60">Готовий до розрахунку</h3>
                        <p className="text-xs font-medium text-white/40 tracking-wider">Оберіть дні та натисніть кнопку "Розрахувати"</p>
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
                                        <div className="px-6 py-2 rounded-xl bg-[#00D4FF]/10 border border-[#00D4FF]/30 text-white text-sm font-black uppercase tracking-[0.3em] shadow-[0_0_15px_rgba(0,212,255,0.2)] backdrop-blur-sm">
                                            День <span className="text-[#00D4FF] ml-1 drop-shadow-[0_0_5px_rgba(0,212,255,0.8)]">{day}</span>
                                        </div>
                                        <div className="h-px bg-gradient-to-r from-[#00D4FF]/50 to-transparent flex-1" />
                                        <div className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em]">
                                            {items.length} ПРЕДМЕТІВ
                                        </div>
                                    </div>

                                    {/* HORIZONTAL TAPE OF CARDS */}
                                    <div className="flex gap-4 overflow-x-auto pb-6 px-1 custom-scrollbar snap-x">
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        {items.sort((a: any, b: any) => (Number(b.p_avg) || 0) - (Number(a.p_avg) || 0)).map((item: any, idx: number) => {
                                            const isSelected = selectedKonditerka === item.p_name;
                                            const pStock = Number(item.p_stock);
                                            const pOrder = Number(item.p_order);
                                            const target = pStock + pOrder;
                                            const percentage = target === 0 ? 100 : Math.min(100, (pStock / target) * 100);

                                            const isCritical = percentage < 60;
                                            const isWarning = percentage >= 60 && percentage < 90;

                                            return (
                                                <div
                                                    key={idx}
                                                    onClick={() => setSelectedKonditerka(prev => prev === item.p_name ? null : item.p_name)}
                                                    className={cn(
                                                        "min-w-[280px] snap-start bg-[#141829]/80 backdrop-blur-md border rounded-2xl transition-all duration-300 cursor-pointer select-none group/card relative overflow-hidden",
                                                        isSelected
                                                            ? "ring-2 ring-[#00D4FF] border-[#00D4FF] shadow-[0_0_30px_rgba(0,212,255,0.3)] scale-[1.02]"
                                                            : "border-white/5 hover:border-white/20 hover:shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
                                                    )}
                                                >
                                                    {isSelected && <div className="absolute inset-0 bg-[#00D4FF]/5 pointer-events-none" />}

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
                                                            <h4 className="text-[11px] font-black text-white/90 leading-tight tracking-tight uppercase group-hover/card:text-[#00D4FF] transition-colors truncate" title={item.p_name}>
                                                                {item.p_name}
                                                            </h4>
                                                            {isCritical && <AlertTriangle size={14} className="text-[#FF6B6B] drop-shadow-[0_0_8px_rgba(255,107,107,0.8)] shrink-0" />}
                                                        </div>

                                                        <div className="flex items-end justify-between mb-4">
                                                            <div className="flex flex-col">
                                                                <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.15em] mb-0.5">ЗАМОВЛЕННЯ</span>
                                                                <div className="flex items-baseline gap-1">
                                                                    <span className={cn(
                                                                        "text-3xl font-black font-mono leading-none tracking-tighter",
                                                                        pOrder > 0 ? "text-[#00D4FF] drop-shadow-[0_0_15px_rgba(0,212,255,0.5)]" : "text-white/20"
                                                                    )}>
                                                                        {pOrder.toFixed(0)}
                                                                    </span>
                                                                    <span className="text-[10px] font-black text-[#00D4FF]/50 uppercase">{item.unit || 'шт'}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.15em] mb-0.5">ФАКТ</span>
                                                                <span className={cn(
                                                                    "text-lg font-black font-mono leading-none",
                                                                    isCritical ? "text-[#FF6B6B] drop-shadow-[0_0_10px_rgba(255,107,107,0.5)]" :
                                                                        isWarning ? "text-[#FFB800] drop-shadow-[0_0_10px_rgba(255,184,0,0.5)]" :
                                                                            "text-emerald-500 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                                                )}>
                                                                    {pStock.toFixed(0)}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="relative h-1.5 bg-[#0B0E14] rounded-full overflow-hidden mb-3 border border-white/5">
                                                            <div
                                                                className={cn(
                                                                    "h-full rounded-full transition-all duration-1000 relative",
                                                                    isCritical ? "bg-[#FF6B6B]" :
                                                                        isWarning ? "bg-[#FFB800]" :
                                                                            "bg-emerald-500"
                                                                )}
                                                                style={{ width: `${percentage}%` }}
                                                            >
                                                                <div className="absolute inset-0 bg-white/20 w-1/2 skew-x-[-20deg] animate-[shimmer_2s_infinite]" />
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between text-[9px] font-bold text-white/40 uppercase tracking-widest pt-1 border-t border-white/5">
                                                            <div className="flex gap-3">
                                                                <span>Мін <span className="text-white font-mono ml-0.5">{Number(item.p_min).toFixed(0)}</span></span>
                                                                <span>Сер <span className="text-white font-mono ml-0.5">{Number(item.p_avg).toFixed(1)}</span></span>
                                                            </div>
                                                            <ChevronDown size={12} className={cn("transition-transform duration-500", isSelected && "rotate-180 text-[#00D4FF]")} />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* FULL GRID ANALYTICS (Appears when a konditerka is selected) */}
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    {selectedKonditerka && items.some((i: any) => i.p_name === selectedKonditerka) && (
                                        <div className="mt-2 bg-[#141829]/50 backdrop-blur-xl border border-[#00D4FF]/20 rounded-3xl p-8 animate-in fade-in slide-in-from-top-4 duration-500 shadow-[0_0_50px_rgba(0,212,255,0.05)] relative overflow-hidden">
                                            {/* Decorative grid pattern */}
                                            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,212,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,212,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

                                            <div className="flex items-baseline justify-between mb-8 pb-4 border-b border-white/5 relative z-10">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-2 h-8 bg-[#00D4FF] rounded-full shadow-[0_0_15px_rgba(0,212,255,0.8)]" />
                                                    <h3 className="text-xl font-black uppercase tracking-[0.2em] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                                                        Аналітика: <span className="text-[#00D4FF]">{selectedKonditerka}</span>
                                                    </h3>
                                                </div>
                                                <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">
                                                    {shopStats?.length || 0} ТОЧОК ПРОДАЖУ ТА ПРІОРИТЕТІВ
                                                </div>
                                            </div>

                                            {!shopStats ? (
                                                <div className="py-20 flex flex-col items-center gap-6 relative z-10">
                                                    <div className="relative">
                                                        <Activity className="animate-spin text-[#00D4FF] relative z-10 drop-shadow-[0_0_15px_rgba(0,212,255,0.8)]" size={48} />
                                                        <div className="absolute inset-0 bg-[#00D4FF]/20 blur-xl rounded-full animate-pulse" />
                                                    </div>
                                                    <span className="text-xs font-black uppercase tracking-[0.3em] text-[#00D4FF]/60">Отримання даних по магазинах...</span>
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
                                                                    "rounded-2xl p-5 border transition-all duration-300 flex flex-col justify-between group/shop relative overflow-hidden backdrop-blur-sm",
                                                                    isDeficit
                                                                        ? "bg-[#FF6B6B]/5 border-[#FF6B6B]/20 shadow-[0_0_20px_rgba(255,107,107,0.1)]"
                                                                        : "bg-[#0B0E14]/80 border-white/5 hover:border-white/20 hover:bg-[#141829]"
                                                                )}>
                                                                    {isDeficit && <div className="absolute inset-0 bg-gradient-to-b from-[#FF6B6B]/5 to-transparent pointer-events-none" />}

                                                                    <div className="flex flex-col mb-4 relative z-10">
                                                                        <h5 className="text-xs font-black uppercase tracking-tight text-white/90 group-hover/shop:text-[#00D4FF] transition-colors mb-2 truncate" title={stat.spot_name}>
                                                                            {stat.spot_name}
                                                                        </h5>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">СЕР.ПРОДАЖІ:</span>
                                                                            <span className="text-sm font-mono font-black text-[#00D4FF]">
                                                                                {Number(stat.avg_sales_day || 0).toFixed(1)}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-end justify-between pt-4 border-t border-white/5 relative z-10">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-[8px] font-black text-white/30 uppercase mb-1">ФАКТ</span>
                                                                            <span className={cn("text-xl font-mono font-black leading-none", isDeficit ? "text-[#FF6B6B] drop-shadow-[0_0_8px_rgba(255,107,107,0.5)]" : "text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]")}>
                                                                                {stat.stock_now || 0}
                                                                                <span className="text-[10px] opacity-70 ml-1 font-sans">{stat.unit || getKonditerkaUnit(selectedKonditerka)}</span>
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex flex-col items-end">
                                                                            <span className="text-[8px] font-black text-[#00D4FF]/50 uppercase mb-1">ТРЕБА</span>
                                                                            <span className="text-2xl font-mono font-black text-[#00D4FF] leading-none drop-shadow-[0_0_10px_rgba(0,212,255,0.4)]">
                                                                                {need.toFixed(0)}
                                                                                <span className="text-[10px] opacity-70 ml-1 font-sans">{stat.unit || getKonditerkaUnit(selectedKonditerka)}</span>
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    {isDeficit && (
                                                                        <div className="absolute top-2 right-2">
                                                                            <div className="w-2 h-2 bg-[#FF6B6B] rounded-full animate-pulse shadow-[0_0_10px_rgba(255,107,107,0.8)]" />
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
