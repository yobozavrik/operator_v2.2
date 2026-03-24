'use client';

import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Loader2, Save, Activity, AlertCircle, Percent, TrendingUp } from 'lucide-react';
import { ProductionTask } from '@/types/bi';
import { getKonditerkaUnit } from '@/lib/konditerka-dictionary';

interface Props {
    data: ProductionTask[]; // From v_konditerka_distribution_stats
    onRefresh: () => void;
}

interface FactoryStockItem {
    product_name: string;
    baked_at_factory: number;
}

interface AnalyticsData {
    kpi: {
        currentStock: number;
        totalNeed: number;
        totalTarget: number;
        criticalPositions: number;
        fillLevel: string;
    };
    top5: {
        konditerka_name: string;
        shop_stock: number;
        risk_index: number;
    }[];
}

import { authedFetcher } from '@/lib/authed-fetcher';

export const KonditerkaOrderFormTable = ({ data, onRefresh }: Props) => {
    // 1. Fetch Factory Stock
    const { data: factoryStockData, isLoading: isStockLoading } = useSWR<FactoryStockItem[]>(
        '/api/konditerka/production-detail',
        (url) => authedFetcher(url),
        { refreshInterval: 10000 }
    );

    // 1.1 Fetch Analytics Data
    const { data: analytics } = useSWR<AnalyticsData>(
        '/api/konditerka/analytics',
        (url) => authedFetcher(url),
        { refreshInterval: 30000 }
    );

    // 2. Local State
    const [productionPlan, setProductionPlan] = useState<Record<string, number>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 3. Aggregate Data
    const tableRows = useMemo(() => {
        return data.map(product => {
            // Calculate Network Deficit (Sum of need_net from all stores)
            // Assuming product.stores contains all store entries for this product
            // deficitKg mapped from need_net in transformer
            const networkDeficit = product.stores.reduce((sum, s) => sum + (s.deficitKg || 0), 0);

            // Find Factory Stock
            const stockItem = factoryStockData?.find(
                item => item.product_name?.trim().toLowerCase() === product.name.trim().toLowerCase()
            );
            const factoryStock = stockItem?.baked_at_factory || 0;

            return {
                id: product.id,
                name: product.name,
                networkDeficit,
                factoryStock,
                currentPlan: productionPlan[product.id] || 0
            };
        })
            .filter(row => row.networkDeficit > 0 || row.factoryStock > 0) // Optional: Hide irrelevant rows? User asked for "Summary table", implying all relevant.
            .sort((a, b) => b.networkDeficit - a.networkDeficit);
    }, [data, factoryStockData, productionPlan]);


    // 4. Submit Handler
    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            // Filter only items with input > 0
            const itemsToOrder = tableRows
                .filter(r => (productionPlan[r.id] || 0) > 0)
                .map(r => ({
                    product_id: r.id,
                    product_name: r.name,
                    quantity: productionPlan[r.id]
                }));

            if (itemsToOrder.length === 0) {
                alert('Будь ласка, введіть кількість.');
                setIsSubmitting(false);
                return;
            }

            const res = await fetch('/api/konditerka/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orders: itemsToOrder })
            });

            if (res.ok) {
                alert('Замовлення сформовано!');
                setProductionPlan({});
                onRefresh();
            } else {
                throw new Error('Failed to create order');
            }
        } catch (error) {
            console.error(error);
            alert('Помилка відправки');
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalDeficit = tableRows.reduce((sum, r) => sum + r.networkDeficit, 0);
    const totalOrdered = Object.values(productionPlan).reduce((sum, v) => sum + v, 0);

    return (
        <div className="flex flex-col h-full bg-[#141829] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            {/* ANALYTICS BLOCK */}
            <div className="p-4 grid gap-4 shrink-0 bg-[#0B0E14] border-b border-white/5 relative overflow-hidden">
                {/* Subtle grid pattern background */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none opacity-50" />

                {/* KPI ROW */}
                <div className="grid grid-cols-4 gap-4 mb-6 relative">
                    {/* KPI 1 */}
                    <div className="bg-[#141829]/80 border border-white/5 shadow-inner rounded-xl p-3 flex flex-col justify-center backdrop-blur-sm relative overflow-hidden group">
                        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-[#00D4FF]/30 to-transparent group-hover:via-[#00D4FF]/70 transition-all duration-500" />
                        <div className="flex items-center gap-2 text-white/50 mb-1 text-[10px] uppercase font-bold tracking-widest">
                            <Activity size={12} className="text-[#00D4FF]" />
                            <span>Залишки в мережі</span>
                        </div>
                        <div className="text-2xl font-mono font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                            {analytics?.kpi?.currentStock?.toLocaleString() ?? '-'}
                            <span className="text-[10px] text-white/30 ml-1">од.</span>
                        </div>
                    </div>
                    {/* KPI 2 */}
                    <div className="bg-[#141829]/80 border border-white/5 shadow-inner rounded-xl p-3 flex flex-col justify-center backdrop-blur-sm relative overflow-hidden group">
                        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-[#FFB800]/30 to-transparent group-hover:via-[#FFB800]/70 transition-all duration-500" />
                        <div className="flex items-center gap-2 text-white/50 mb-1 text-[10px] uppercase font-bold tracking-widest">
                            <TrendingUp size={12} className="text-[#FFB800]" />
                            <span>Загальна потреба</span>
                        </div>
                        <div className="text-2xl font-mono font-black text-[#FFB800] drop-shadow-[0_0_15px_rgba(255,184,0,0.3)]">
                            {analytics?.kpi?.totalNeed?.toLocaleString() ?? '-'}
                            <span className="text-[10px] text-white/30 ml-1">од.</span>
                        </div>
                    </div>
                    {/* KPI 3: Target Stock (Replaces Critical) */}
                    <div className="bg-[#141829]/80 border border-white/5 shadow-inner rounded-xl p-3 flex flex-col justify-center backdrop-blur-sm relative overflow-hidden group">
                        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-[#00D4FF]/30 to-transparent group-hover:via-[#00D4FF]/70 transition-all duration-500" />
                        <div className="flex items-center gap-2 text-white/50 mb-1 text-[10px] uppercase font-bold tracking-widest">
                            <Activity size={12} className="text-[#00D4FF]" />
                            <span>Цільовий запас</span>
                        </div>
                        <div className="text-2xl font-mono font-black text-[#00D4FF] drop-shadow-[0_0_15px_rgba(0,212,255,0.4)]">
                            {analytics?.kpi?.totalTarget?.toLocaleString() ?? '-'}
                            <span className="text-[10px] text-[#00D4FF]/50 ml-1">од.</span>
                        </div>
                    </div>
                    {/* KPI 4 */}
                    <div className="bg-[#141829]/80 border border-white/5 shadow-inner rounded-xl p-3 flex flex-col justify-center backdrop-blur-sm relative overflow-hidden group">
                        <div className={cn(
                            "absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent to-transparent transition-all duration-500",
                            Number(analytics?.kpi?.fillLevel) >= 80 ? "via-emerald-500/30 group-hover:via-emerald-500/70" : "via-amber-500/30 group-hover:via-amber-500/70"
                        )} />
                        <div className="flex items-center gap-2 text-white/50 mb-1 text-[10px] uppercase font-bold tracking-widest">
                            <Percent size={12} className={Number(analytics?.kpi?.fillLevel) >= 80 ? "text-emerald-500" : "text-amber-500"} />
                            <span>Рівень наповнення</span>
                        </div>
                        <div className={cn(
                            "text-2xl font-mono font-black",
                            Number(analytics?.kpi?.fillLevel) >= 80 ? "text-emerald-500 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]" : "text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                        )}>
                            {analytics?.kpi?.fillLevel ?? '-'}%
                        </div>
                    </div>
                </div>

                {/* TOP 5 TABLE */}
                {analytics?.top5 && analytics.top5.length > 0 && (
                    <div className="bg-[#141829] border border-[#E74856]/20 shadow-[0_0_15px_rgba(231,72,86,0.05)] rounded-xl p-3 relative flex-1">
                        <div className="text-[10px] text-[#E74856] uppercase font-bold tracking-widest mb-2 flex items-center gap-2 drop-shadow-[0_0_5px_rgba(231,72,86,0.5)]">
                            <TrendingUp size={12} />
                            ТОП-5 Гарячих позицій
                        </div>
                        <div className="grid grid-cols-5 gap-2 h-full">
                            {analytics.top5.map((item, idx) => (
                                <div key={idx} className="bg-[#0B0E14] rounded p-2 border border-white/5 flex items-center justify-between group hover:border-[#E74856]/30 transition-colors">
                                    <div className="text-xs font-bold text-white/80 group-hover:text-[#E74856] transition-colors truncate max-w-[100px]" title={item.konditerka_name}>
                                        {item.konditerka_name}
                                    </div>
                                    <div className="text-right leading-none">
                                        <div className={cn("font-mono font-black", item.shop_stock <= 0 ? "text-[#E74856]" : "text-white")}>
                                            {item.shop_stock} {getKonditerkaUnit(item.konditerka_name)}
                                        </div>
                                        <div className="text-[9px] text-[#E74856]/50 mt-0.5 uppercase tracking-widest">Risk: {item.risk_index}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Header */}
            <div className="grid grid-cols-[3fr_1fr_1fr_1.5fr] gap-4 px-6 py-4 bg-[#0B0E14] border-b border-white/5 text-[10px] uppercase font-bold tracking-widest text-[#00D4FF]/60 relative z-10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <div>Назва кондитерки</div>
                <div className="text-right text-[#FF6B6B]">Дефіцит мережі</div>
                <div className="text-right text-[#00D4FF]">В цеху</div>
                <div className="text-center text-[#FFB800]">Заявка</div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 relative bg-[#141829]">
                {isStockLoading && !factoryStockData && (
                    <div className="flex justify-center p-4"><Loader2 className="animate-spin text-[#00D4FF]" /></div>
                )}

                {tableRows.map(row => (
                    <div key={row.id} className="grid grid-cols-[3fr_1fr_1fr_1.5fr] gap-4 items-center px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors group">
                        <div className="font-bold text-white group-hover:text-[#00D4FF] transition-colors">{row.name}</div>

                        <div className="text-right font-mono font-black text-lg text-[#FF6B6B]">
                            {row.networkDeficit > 0 ? (
                                <span className="drop-shadow-[0_0_10px_rgba(255,107,107,0.4)]">
                                    {row.networkDeficit}
                                    <span className="text-[10px] ml-1 opacity-60 font-sans tracking-normal">{getKonditerkaUnit(row.name)}</span>
                                </span>
                            ) : <span className="text-white/20">-</span>}
                        </div>

                        <div className="text-right font-mono font-black text-lg text-[#00D4FF]">
                            {row.factoryStock > 0 ? (
                                <span className="drop-shadow-[0_0_10px_rgba(0,212,255,0.4)]">
                                    {row.factoryStock}
                                    <span className="text-[10px] ml-1 opacity-60 font-sans tracking-normal">{getKonditerkaUnit(row.name)}</span>
                                </span>
                            ) : <span className="text-white/20">-</span>}
                        </div>

                        <div className="flex justify-center relative">
                            <input
                                type="number"
                                value={productionPlan[row.id] || ''}
                                onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value));
                                    setProductionPlan(prev => ({ ...prev, [row.id]: val }));
                                }}
                                className={cn(
                                    "w-24 h-10 bg-[#0B0E14] border border-white/10 rounded-lg text-center font-mono font-black text-xl text-white focus:outline-none focus:border-[#FFB800] focus:shadow-[0_0_15px_rgba(255,184,0,0.3)] transition-all z-10",
                                    (productionPlan[row.id] || 0) > 0 && "text-[#FFB800] border-[#FFB800]/50 shadow-[0_0_10px_rgba(255,184,0,0.2)]"
                                )}
                                placeholder="-"
                            />
                            {/* Glow behind active input */}
                            {(productionPlan[row.id] || 0) > 0 && (
                                <div className="absolute inset-0 bg-[#FFB800]/20 blur-xl z-0 pointer-events-none rounded-full scale-110" />
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="p-4 bg-[#0B0E14] border-t border-white/5 flex items-center justify-between relative z-10 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-6">
                    <div>
                        <div className="text-[10px] text-white/40 uppercase font-black tracking-widest mb-1">Дефіцит</div>
                        <div className="text-xl font-mono font-black text-[#FF6B6B] drop-shadow-[0_0_10px_rgba(255,107,107,0.5)]">{totalDeficit}</div>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div>
                        <div className="text-[10px] text-[#FFB800]/60 uppercase font-black tracking-widest mb-1">Заявка</div>
                        <div className="text-xl font-mono font-black text-[#FFB800] drop-shadow-[0_0_15px_rgba(255,184,0,0.5)]">{totalOrdered}</div>
                    </div>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || totalOrdered === 0}
                    className="group relative flex items-center gap-2 px-8 py-3 bg-[#FFB800] hover:bg-[#FFC933] text-[#0B0E14] font-black uppercase tracking-[0.2em] rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,184,0,0.3)] overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-150%] skew-x-[-45deg] group-hover:transition-transform group-hover:duration-700 group-hover:translate-x-[150%]" />
                    {isSubmitting ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                    Сформувати
                </button>
            </div>
        </div>
    );
};
