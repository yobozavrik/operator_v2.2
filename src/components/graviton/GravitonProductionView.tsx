import React from 'react';
import useSWR from 'swr';
import { ChefHat, Loader2, AlertCircle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// --- INTERFACE ---
interface GravitonProductionItem {
    product_name: string;
    produced_weight: number; // in kg
    unit?: string;
}

import { authedFetcher } from '@/lib/authed-fetcher';

const fetcher = authedFetcher;

export const GravitonProductionView = () => {
    const { data, error, isLoading } = useSWR<GravitonProductionItem[]>(
        '/api/graviton/production-detail',
        fetcher,
        { refreshInterval: 10000 }
    );

    // Calculate Total
    const totalWeight = React.useMemo(() => {
        if (!data) return 0;
        return data.reduce((sum, item) => sum + (Number(item.produced_weight) || 0), 0);
    }, [data]);

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-0 lg:p-0 bg-transparent flex flex-col">
            <div className="bg-[#141829] border border-white/5 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-full">

                {/* HEADER */}
                <div className="p-4 border-b border-white/5 bg-[#0B0E14]/80 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#00D4FF]/10 flex items-center justify-center border border-[#00D4FF]/20">
                            <TrendingUp size={20} className="text-[#00D4FF]" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Звіт Виробництва</h3>
                            <div className="text-[10px] text-white/50 uppercase font-bold tracking-widest mt-0.5">Гравітон • Останні 24 год</div>
                        </div>
                    </div>

                    {/* TOTAL BADGE */}
                    <div className="flex flex-col items-end">
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl font-mono font-black text-[#00D4FF] drop-shadow-[0_0_15px_rgba(0,212,255,0.5)]">
                                {totalWeight.toFixed(1)}
                            </span>
                            <span className="text-[10px] text-white/40 font-bold uppercase">кг</span>
                        </div>
                        <span className="text-[9px] text-[#00D4FF]/60 uppercase font-black tracking-widest drop-shadow-[0_0_10px_rgba(0,212,255,0.3)]">Всього випущено</span>
                    </div>
                </div>

                {/* CONTENT */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-white/40 gap-3">
                            <Loader2 size={32} className="animate-spin text-[#00D4FF]" />
                            <span className="text-xs font-mono uppercase tracking-widest">Завантаження даних...</span>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-full text-[#FF6B6B] gap-3">
                            <AlertCircle size={32} />
                            <span className="text-sm font-bold uppercase tracking-widest drop-shadow-[0_0_10px_rgba(255,107,107,0.5)]">Помилка з'єднання</span>
                        </div>
                    ) : data && data.length > 0 ? (
                        <table className="w-full text-left border-collapse relative">
                            <thead className="sticky top-0 bg-[#0B0E14]/90 text-[10px] uppercase font-bold tracking-widest text-[#00D4FF]/60 border-b-2 border-[#00D4FF]/20 shadow-[0_4px_20px_rgba(0,0,0,0.5)] z-10 backdrop-blur-md">
                                <tr>
                                    <th className="p-4 pl-6">Продукт</th>
                                    <th className="p-4 pr-6 text-right">Вага (кг)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {data.map((item, i) => (
                                    <tr key={i} className="group hover:bg-white/5 transition-colors">
                                        <td className="p-4 pl-6">
                                            <div className="text-sm font-bold text-white/90 group-hover:text-white transition-colors">
                                                {item.product_name}
                                            </div>
                                        </td>
                                        <td className="p-4 pr-6 text-right">
                                            <span className={cn(
                                                "inline-flex items-center justify-center px-3 py-1.5 rounded-lg font-mono text-sm font-black min-w-[4rem] border transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)]",
                                                item.produced_weight > 0
                                                    ? "bg-[#00D4FF]/20 text-[#00D4FF] border-[#00D4FF]/30 group-hover:bg-[#00D4FF]/30 group-hover:shadow-[0_0_20px_rgba(0,212,255,0.3)]"
                                                    : "bg-white/5 text-white/40 border-white/5"
                                            )}>
                                                {item.produced_weight.toFixed(1)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="sticky bottom-0 bg-[#0B0E14]/90 border-t border-[#00D4FF]/30 shadow-[0_-4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md z-10">
                                <tr>
                                    <td className="p-4 pl-6 text-sm font-black text-white uppercase tracking-wider text-right shadow-text">
                                        ВСЬОГО ЗА ЗМІНУ:
                                    </td>
                                    <td className="p-4 pr-6 text-right">
                                        <span className="text-xl font-mono font-black text-[#00D4FF] drop-shadow-[0_0_15px_rgba(0,212,255,0.5)]">
                                            {totalWeight.toFixed(1)} <span className="text-sm text-[#00D4FF]/60 font-bold ml-1">кг</span>
                                        </span>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-white/20">
                            <ChefHat size={48} className="mb-4 opacity-50 text-white/30" />
                            <span className="text-sm font-medium">Виробництво ще не розпочато</span>
                            <span className="text-[10px] uppercase tracking-widest mt-1 opacity-50">Дані відсутні</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
