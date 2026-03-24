'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
    ArrowLeft,
    TrendingUp,
    TrendingDown,
    BarChart2,
    DollarSign,
    PackageOpen,
    PieChart,
    Calendar,
    ChevronDown,
    Store,
    Package
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
    Cell
} from 'recharts';
import { cn } from '@/lib/utils';
import { Chakra_Petch, JetBrains_Mono } from 'next/font/google';
import { authedFetcher } from '@/lib/authed-fetcher';

const chakra = Chakra_Petch({
    weight: ['300', '400', '500', '600', '700'],
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-chakra',
});

const jetbrains = JetBrains_Mono({
    weight: ['400', '700'],
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-jetbrains',
});

export const KonditerkaFinancialDashboard = () => {
    const [period, setPeriod] = useState('Цей Тиждень');

    const { startDate, endDate } = useMemo(() => {
        const today = new Date();
        const start = new Date(today);
        const end = new Date(today);

        if (period === 'Вчора') {
            start.setDate(today.getDate() - 1);
            end.setDate(today.getDate() - 1);
        } else if (period === 'Цей Тиждень') {
            const day = today.getDay();
            const diff = today.getDate() - day + (day === 0 ? -6 : 1);
            start.setDate(diff);
        } else if (period === 'Цей Місяць') {
            start.setDate(1);
        }

        return {
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0]
        };
    }, [period]);

    const { data, isLoading } = useSWR(
        `/api/konditerka/finance?startDate=${startDate}&endDate=${endDate}`,
        authedFetcher
    );

    const calculateTrend = (current: number, previous: number) => {
        if (previous === 0) return { value: 0, isPositive: true };
        const diff = current - previous;
        const val = (diff / previous) * 100;
        return { value: val.toFixed(1), isPositive: val >= 0 };
    };

    if (isLoading || !data) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#0B0F19] text-white">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4"></div>
                <div className="text-slate-400 font-mono">Завантаження аналітики кондитерки...</div>
            </div>
        );
    }

    const { revenueTrendData, storesData, topProducts, kpis } = data;

    const revTrend = calculateTrend(kpis.current.revenue, kpis.previous.revenue);
    const profTrend = calculateTrend(kpis.current.profit, kpis.previous.profit);
    const qtyTrend = calculateTrend(kpis.current.qty, kpis.previous.qty);
    const margDiff = (kpis.current.margin_pct - kpis.previous.margin_pct).toFixed(1);

    return (
        <div className={cn(
            "min-h-screen bg-[#0B0F19] text-white font-sans selection:bg-[#2b80ff] selection:text-white flex flex-col",
            chakra.variable,
            jetbrains.variable,
            "font-[family-name:var(--font-chakra)]"
        )}>
            {/* Header / Top Navigation */}
            <div className="border-b border-white/10 bg-[#0B0F19]/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-[1920px] mx-auto p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-6">
                        <Link href="/" className="text-slate-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 p-2 rounded-lg border border-white/10">
                            <ArrowLeft size={20} />
                        </Link>
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                                <DollarSign className="text-emerald-500" size={24} />
                            </div>
                            <div>
                                <h1 className="text-xl md:text-2xl font-bold uppercase tracking-wider text-white">Фінансова Аналітика</h1>
                                <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-400 tracking-[0.2em] font-[family-name:var(--font-jetbrains)] uppercase">
                                    <span>Revenue Intelligence</span>
                                    <span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse"></span>
                                    <span>Live Data</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto custom-scrollbar pb-1 md:pb-0">
                        <div className="flex bg-white/5 border border-white/10 rounded-lg p-1">
                            {['Сьогодні', 'Вчора', 'Цей Тиждень', 'Цей Місяць'].map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPeriod(p)}
                                    className={cn(
                                        "px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all font-[family-name:var(--font-jetbrains)]",
                                        period === p ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "text-slate-400 hover:text-white transparent"
                                    )}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                        <button className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-300 uppercase tracking-wider font-[family-name:var(--font-jetbrains)] bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors shrink-0">
                            <Calendar size={14} className="text-slate-400" />
                            Кастомний Період
                            <ChevronDown size={14} className="text-slate-500" />
                        </button>
                    </div>
                </div>
            </div>

            <main className="flex-1 max-w-[1920px] mx-auto w-full p-4 md:p-6 space-y-6">

                {/* Top KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Revenue Card */}
                    <div className="bg-gradient-to-br from-white/5 to-transparent border border-white/10 rounded-2xl p-5 relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
                        <div className="flex justify-between items-start mb-4 relative z-10">
                            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                                <DollarSign size={20} />
                            </div>
                            <div className={cn("px-2 py-1 rounded border flex items-center gap-1", revTrend.isPositive ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-[#E74856]/10 border-[#E74856]/20 text-[#E74856]")}>
                                {revTrend.isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                <span className="text-[10px] font-mono font-bold font-[family-name:var(--font-jetbrains)]">{revTrend.isPositive ? '+' : ''}{revTrend.value}%</span>
                            </div>
                        </div>
                        <div className="relative z-10">
                            <div className="text-[11px] uppercase font-mono text-slate-400 tracking-wider mb-1 font-[family-name:var(--font-jetbrains)]">Загальний Виторг</div>
                            <div className="flex items-baseline gap-2">
                                <div className="text-3xl font-bold tracking-tight text-white tabular-nums">
                                    {(kpis.current.revenue || 0).toLocaleString('uk-UA', { maximumFractionDigits: 0 })}
                                </div>
                                <div className="text-sm font-medium text-slate-500 uppercase">грн</div>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-2 font-mono font-[family-name:var(--font-jetbrains)]">vs {(kpis.previous.revenue || 0).toLocaleString('uk-UA', { maximumFractionDigits: 0 })} минулий період</div>
                        </div>
                    </div>

                    {/* Profit Card */}
                    <div className="bg-gradient-to-br from-white/5 to-transparent border border-white/10 rounded-2xl p-5 relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#2b80ff]/10 rounded-full blur-2xl group-hover:bg-[#2b80ff]/20 transition-all"></div>
                        <div className="flex justify-between items-start mb-4 relative z-10">
                            <div className="p-2.5 rounded-xl bg-[#2b80ff]/10 border border-[#2b80ff]/20 text-[#2b80ff]">
                                <PackageOpen size={20} />
                            </div>
                            <div className={cn("px-2 py-1 rounded border flex items-center gap-1", profTrend.isPositive ? "bg-[#2b80ff]/10 border-[#2b80ff]/20 text-[#2b80ff]" : "bg-[#E74856]/10 border-[#E74856]/20 text-[#E74856]")}>
                                {profTrend.isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                <span className="text-[10px] font-mono font-bold font-[family-name:var(--font-jetbrains)]">{profTrend.isPositive ? '+' : ''}{profTrend.value}%</span>
                            </div>
                        </div>
                        <div className="relative z-10">
                            <div className="text-[11px] uppercase font-mono text-slate-400 tracking-wider mb-1 font-[family-name:var(--font-jetbrains)]">Валовий Прибуток</div>
                            <div className="flex items-baseline gap-2">
                                <div className="text-3xl font-bold tracking-tight text-white tabular-nums">
                                    {(kpis.current.profit || 0).toLocaleString('uk-UA', { maximumFractionDigits: 0 })}
                                </div>
                                <div className="text-sm font-medium text-slate-500 uppercase">грн</div>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-2 font-mono font-[family-name:var(--font-jetbrains)]">vs {(kpis.previous.profit || 0).toLocaleString('uk-UA', { maximumFractionDigits: 0 })} минулий період</div>
                        </div>
                    </div>

                    {/* Quantity Card */}
                    <div className="bg-gradient-to-br from-white/5 to-transparent border border-white/10 rounded-2xl p-5 relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all"></div>
                        <div className="flex justify-between items-start mb-4 relative z-10">
                            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
                                <Package size={20} />
                            </div>
                            <div className={cn("px-2 py-1 rounded border flex items-center gap-1", qtyTrend.isPositive ? "bg-amber-500/10 border-amber-500/20 text-amber-500" : "bg-[#E74856]/10 border-[#E74856]/20 text-[#E74856]")}>
                                {qtyTrend.isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                <span className="text-[10px] font-mono font-bold font-[family-name:var(--font-jetbrains)]">{qtyTrend.isPositive ? '+' : ''}{qtyTrend.value}%</span>
                            </div>
                        </div>
                        <div className="relative z-10">
                            <div className="text-[11px] uppercase font-mono text-slate-400 tracking-wider mb-1 font-[family-name:var(--font-jetbrains)]">Кількість (Піци)</div>
                            <div className="flex items-baseline gap-2">
                                <div className="text-3xl font-bold tracking-tight text-white tabular-nums">
                                    {(kpis.current.qty || 0).toLocaleString('uk-UA', { maximumFractionDigits: 0 })}
                                </div>
                                <div className="text-sm font-medium text-slate-500 uppercase">од.</div>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-2 font-mono font-[family-name:var(--font-jetbrains)]">vs {(kpis.previous.qty || 0).toLocaleString('uk-UA', { maximumFractionDigits: 0 })} минулий період</div>
                        </div>
                    </div>

                    {/* Margin Card */}
                    <div className="bg-gradient-to-br from-white/5 to-transparent border border-white/10 rounded-2xl p-5 relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all"></div>
                        <div className="flex justify-between items-start mb-4 relative z-10">
                            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                                <PieChart size={20} />
                            </div>
                            <div className="px-2 py-1 rounded bg-slate-800 border border-slate-700 flex items-center gap-1">
                                <span className="text-[10px] font-mono text-slate-400 uppercase font-[family-name:var(--font-jetbrains)]">{(Number(margDiff) > 0 ? '+' : '')}{margDiff} %</span>
                            </div>
                        </div>
                        <div className="relative z-10">
                            <div className="text-[11px] uppercase font-mono text-slate-400 tracking-wider mb-1 font-[family-name:var(--font-jetbrains)]">Маржинальність</div>
                            <div className="flex items-baseline gap-2">
                                <div className="text-3xl font-bold tracking-tight text-white tabular-nums">
                                    {(kpis.current.margin_pct || 0).toFixed(1)}
                                </div>
                                <div className="text-sm font-medium text-slate-500 uppercase">%</div>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-2 font-mono font-[family-name:var(--font-jetbrains)]">vs {(kpis.previous.margin_pct || 0).toFixed(1)}% минулий період</div>
                        </div>
                    </div>
                </div>

                {/* Main Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Revenue Trend Line Chart */}
                    <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col min-h-[400px]">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-lg font-bold uppercase tracking-wider flex items-center gap-2">
                                    <BarChart2 className="text-[#2b80ff]" size={18} />
                                    Динаміка Виторгу Піци
                                </h3>
                                <p className="text-xs text-slate-400 font-mono mt-1 font-[family-name:var(--font-jetbrains)]">Порівняння з попереднім періодом</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm bg-emerald-500"></div>
                                    <span className="text-[10px] uppercase font-bold text-slate-300">Поточний</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm border-2 border-slate-600 border-dashed"></div>
                                    <span className="text-[10px] uppercase font-bold text-slate-500">Попередній</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 w-full relative">
                            {revenueTrendData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={revenueTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                                        <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${(Number(value ?? 0) / 1000).toFixed(0)}к`} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                                            itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                            labelStyle={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}
                                            formatter={(value) => [`${Number(value ?? 0).toLocaleString('uk-UA')} грн`, 'Виторг']}
                                        />
                                        <Line type="monotone" dataKey="previous" stroke="#475569" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{ r: 4 }} />
                                        <Line type="monotone" dataKey="current" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6, strokeWidth: 0 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-slate-500">Немає даних за цей період</div>
                            )}
                        </div>
                    </div>

                    {/* Store Distribution Bar Chart */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col min-h-[400px]">
                        <div className="mb-6">
                            <h3 className="text-lg font-bold uppercase tracking-wider flex items-center gap-2">
                                <Store className="text-emerald-500" size={18} />
                                Виторг по Магазинах
                            </h3>
                            <p className="text-xs text-slate-400 font-mono mt-1 font-[family-name:var(--font-jetbrains)]">Абсолютні значення в грн</p>
                        </div>
                        <div className="flex-1 w-full relative">
                            {storesData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={storesData} layout="vertical" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                                        <XAxis type="number" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `${(Number(value ?? 0) / 1000).toFixed(0)}к`} />
                                        <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} width={80} />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                                            formatter={(value) => [`${Number(value ?? 0).toLocaleString('uk-UA')} грн`, 'Виторг']}
                                        />
                                        <Bar dataKey="revenue" fill="#2b80ff" radius={[0, 4, 4, 0]}>
                                            {storesData.map((entry: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#2b80ff'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-slate-500">Немає даних</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Bottom Row */}
                <div className="w-full">
                    {/* Top Products Table (ABC) */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col">
                        <div className="flex justify-between items-end mb-6">
                            <div>
                                <h3 className="text-lg font-bold uppercase tracking-wider">ABC Аналіз: Топ SKU</h3>
                                <p className="text-xs text-slate-400 font-mono mt-1 font-[family-name:var(--font-jetbrains)]">Драйвери виручки (Джерело: v_gb_top_products_analytics)</p>
                            </div>
                            <button className="text-xs text-[#2b80ff] hover:text-[#5294ff] font-bold uppercase transition-colors">
                                Показати всі
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-full">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500 w-12">#</th>
                                        <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Товар</th>
                                        <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">К-сть (од.)</th>
                                        <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Виторг (грн)</th>
                                        {/* Trend removed since we don't have historical sku data natively merged yet, fallback to a dash */}
                                        <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Тренд</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topProducts && topProducts.length > 0 ? topProducts.map((p: any, idx: number) => {
                                        return (
                                            <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                                <td className="py-3 px-4">
                                                    <div className={cn(
                                                        "w-6 h-6 rounded flex items-center justify-center font-bold text-xs",
                                                        p.rank === 1 ? "bg-amber-500/20 text-amber-500" :
                                                            p.rank === 2 ? "bg-slate-300/20 text-slate-300" :
                                                                p.rank === 3 ? "bg-orange-700/20 text-orange-500" :
                                                                    "bg-white/5 text-slate-500"
                                                    )}>
                                                        {p.rank}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-sm font-medium text-white">{p.name || 'Невідомий товар'}</td>
                                                <td className="py-3 px-4 text-sm text-right font-mono text-slate-300">
                                                    {Number(p.qty).toLocaleString('uk-UA', { maximumFractionDigits: 1 })}
                                                </td>
                                                <td className="py-3 px-4 text-sm text-right font-mono font-bold text-emerald-400">
                                                    {Number(p.revenue).toLocaleString('uk-UA', { maximumFractionDigits: 0 })}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded font-mono text-[10px] font-bold bg-white/5 text-slate-500">
                                                        -
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    }) : (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center text-slate-500">Немає товарів у даному періоді</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </main>

        </div>
    );
};
