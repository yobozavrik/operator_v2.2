'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Activity, AlertTriangle, TrendingDown, Store, AlertCircle, Percent, ArrowUpRight, ArrowDownRight, Package, TrendingUp, Calendar, ChevronLeft, Loader2, X, Search, LayoutGrid, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { Chakra_Petch, JetBrains_Mono } from 'next/font/google';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const chakra = Chakra_Petch({ weight: ['300', '400', '500', '600', '700'], subsets: ['latin'], variable: '--font-chakra' });
const jetbrains = JetBrains_Mono({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-jetbrains' });



function BakeryDashboard() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const activeTabParam = searchParams.get('tab');
    const activeTab = (activeTabParam === 'network' || activeTabParam === 'ranking' || activeTabParam === 'catalog' || activeTabParam === 'discount' || activeTabParam === 'trend') ? activeTabParam : 'network';

    const setTab = (tab: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', tab);
        router.push(`${pathname}?${params.toString()}`);
    };
    const [selectedSku, setSelectedSku] = useState<{ id: string, name: string } | null>(null);
    const [metricMode, setMetricMode] = useState<'qty' | 'revenue'>('qty');

    // Инициализируем даты (по умолчанию - последние 14 дней)
    const [startDate, setStartDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 14);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    });

    const handlePresetChange = (days: number) => {
        const end = new Date();
        const start = new Date();
        end.setDate(end.getDate() - 1);
        start.setDate(end.getDate() - (days - 1));
        setEndDate(end.toISOString().split('T')[0]);
        setStartDate(start.toISOString().split('T')[0]);
    };

    const periodQuery = `start_date=${startDate}&end_date=${endDate}`;

    const { data: apiData, error, isLoading } = useSWR(`/api/bakery/analytics?${periodQuery}`, fetcher);

    // API для каталога и карточек
    const { data: catalogData, isLoading: catalogLoading } = useSWR(`/api/bakery/catalog?${periodQuery}`, fetcher);
    const { data: storesData, isLoading: storesLoading } = useSWR(selectedSku ? `/api/bakery/catalog/stores?sku_id=${selectedSku.id}&${periodQuery}` : null, fetcher);

    // Remove safe fallbacks since the API is fixed
    const network = apiData?.network || {};
    const ranking = apiData?.ranking || {};
    const trends = apiData?.trends || [];

    // Здоров'я дисконту
    const allStores = [...(ranking.top_stores || []), ...(ranking.bottom_stores || [])];
    const discountStores = allStores.filter(s => s.cannibalization_pct !== undefined).sort((a, b) => b.cannibalization_pct - a.cannibalization_pct);
    const discountHealth = discountStores;

    return (
        <div className={cn("min-h-screen bg-[#F7F7F7] text-[#73879C] selection:bg-[#2b80ff] selection:text-white p-4 md:p-8 font-sans flex flex-col", chakra.variable, jetbrains.variable, "font-[family-name:var(--font-chakra)]")}>

            <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">

                {/* Header Back Link */}
                <div className="shrink-0">
                    <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#73879C] hover:text-[#2b80ff] transition-colors uppercase tracking-widest font-bold">
                        <ChevronLeft size={16} /> Повернутись до Command Center
                    </Link>
                </div>

                {/* Main Panel */}
                <div className="flex-1 bg-white border border-gray-200 rounded-2xl flex flex-col overflow-hidden shadow-sm">

                    {/* Header Area */}
                    <div className="p-6 border-b border-gray-100 bg-white flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 shrink-0 relative overflow-hidden">
                        <div className="flex flex-col gap-3 relative z-10 w-full xl:w-auto">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                                    <Store className="text-[#2b80ff]" size={24} />
                                </div>
                                <div className="leading-none pt-1">
                                    <h2 className="text-2xl font-black text-[#2A3F54] uppercase tracking-tight m-0 p-0 text-shadow-none">
                                        Аналітичний дашборд
                                    </h2>
                                    <h2 className="text-2xl font-black text-[#2A3F54] uppercase tracking-tight m-0 p-0 mt-1">
                                        "Крафтова пекарня"
                                    </h2>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <p className="text-sm text-[#73879C] m-0 font-medium">
                                    Аналітичний шар даних (Свіжий, Дисконт, Списання)
                                </p>
                                {isLoading && <Loader2 size={14} className="animate-spin text-[#2b80ff]" />}
                                {!isLoading && apiData && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-widest bg-emerald-50 text-[#1ABB9C] border border-emerald-100 uppercase">
                                        Live
                                    </span>
                                )}
                                <Link
                                    href="/bakery/sales"
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase bg-[#2b80ff] text-white hover:bg-[#2569d6] transition-colors"
                                >
                                    <LayoutGrid size={12} />
                                    Продажі
                                </Link>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex flex-col xl:items-end gap-3 relative z-10 w-full xl:w-auto">
                            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl p-1 shadow-inner w-full xl:w-auto justify-between xl:justify-start">
                                <div className="flex items-center px-4 gap-3 border-r border-gray-200 shrink-0">
                                    <Calendar size={16} className="text-[#73879C]" />
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="bg-transparent text-sm text-[#2A3F54] font-bold outline-none cursor-pointer w-[115px] tracking-tight"
                                            max={endDate}
                                        />
                                        <span className="text-[#73879C]">-</span>
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="bg-transparent text-sm text-[#2A3F54] font-bold outline-none cursor-pointer w-[115px] tracking-tight"
                                            min={startDate}
                                        />
                                    </div>
                                </div>
                                <div className="relative">
                                    <select
                                        defaultValue=""
                                        onChange={(e) => {
                                            if (e.target.value) handlePresetChange(Number(e.target.value));
                                            e.target.value = "";
                                        }}
                                        className="appearance-none absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    >
                                        <option value="" disabled>Шаблони</option>
                                        <option value={1}>За 1 день (Вчора)</option>
                                        <option value={7}>Останні 7 днів</option>
                                        <option value={14}>Останні 14 днів</option>
                                        <option value={30}>Останні 30 днів</option>
                                    </select>
                                    <button className="flex items-center gap-2 px-6 py-1.5 text-sm font-black text-[#2b80ff] uppercase tracking-widest shrink-0 hover:bg-white rounded-lg transition-all">
                                        Період
                                        <ChevronDown size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row flex-1 overflow-hidden bg-gray-50/30">
                        {/* SIDEBAR */}
                        <div className="w-full lg:w-64 shrink-0 border-r border-gray-100 bg-white p-4 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-y-auto custom-scrollbar border-b lg:border-b-0 shadow-sm z-10">
                            <button onClick={() => setTab('network')} className={cn("px-4 py-3 text-xs font-black uppercase rounded-xl transition-all tracking-widest flex items-center justify-start gap-3 shrink-0 text-left", activeTab === 'network' ? "bg-gray-100 text-[#2b80ff] shadow-inner" : "text-[#73879C] hover:bg-gray-50")}>
                                <Activity size={18} />
                                <span className="inline whitespace-nowrap">Мережа</span>
                            </button>
                            <button onClick={() => setTab('ranking')} className={cn("px-4 py-3 text-xs font-black uppercase rounded-xl transition-all tracking-widest flex items-center justify-start gap-3 shrink-0 text-left", activeTab === 'ranking' ? "bg-gray-100 text-[#2b80ff] shadow-inner" : "text-[#73879C] hover:bg-gray-50")}>
                                <TrendingUp size={18} />
                                <span className="inline whitespace-nowrap">Ренкінг/ABC</span>
                            </button>
                            <button onClick={() => setTab('catalog')} className={cn("px-4 py-3 text-xs font-black uppercase rounded-xl transition-all tracking-widest flex items-center justify-start gap-3 shrink-0 text-left", activeTab === 'catalog' ? "bg-gray-100 text-[#2b80ff] shadow-inner" : "text-[#73879C] hover:bg-gray-50")}>
                                <LayoutGrid size={18} />
                                <span className="inline whitespace-nowrap">Каталог</span>
                            </button>
                            <button onClick={() => setTab('discount')} className={cn("px-4 py-3 text-xs font-black uppercase rounded-xl transition-all tracking-widest flex items-center justify-start gap-3 shrink-0 text-left", activeTab === 'discount' ? "bg-gray-100 text-[#2b80ff] shadow-inner" : "text-[#73879C] hover:bg-gray-50")}>
                                <Percent size={18} />
                                <span className="inline whitespace-nowrap">Здоров'я дисконту</span>
                            </button>
                            <button onClick={() => setTab('trend')} className={cn("px-4 py-3 text-xs font-black uppercase rounded-xl transition-all tracking-widest flex items-center justify-start gap-3 shrink-0 text-left", activeTab === 'trend' ? "bg-gray-100 text-[#2b80ff] shadow-inner" : "text-[#73879C] hover:bg-gray-50")}>
                                <TrendingDown size={18} />
                                <span className="inline whitespace-nowrap">Тренди</span>
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-auto custom-scrollbar p-6">
                            {/* NETWORK TAB */}
                            {activeTab === 'network' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 border-l-2 border-[#1ABB9C] pl-3">Глобальні Метрики Мережі</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                        <div className="x-panel !p-5 flex flex-col relative overflow-hidden group">
                                            <div className="text-[10px] uppercase font-black text-gray-400 tracking-widest mb-2 relative z-10">Привезено (шт)</div>
                                            <div className="text-3xl font-bold relative z-10 text-[#2A3F54] tracking-tight">{network.qty_delivered || 0}</div>
                                            <Package className="absolute right-4 bottom-4 text-gray-200 opacity-20" size={48} />
                                        </div>
                                        <div className="x-panel !p-5 flex flex-col relative overflow-hidden group bg-emerald-50/30 border-emerald-100">
                                            <div className="text-[10px] uppercase font-black text-[#1ABB9C] tracking-widest mb-2 relative z-10">Продано Фреш & Дисконт</div>
                                            <div className="text-3xl font-bold relative z-10 text-[#1ABB9C] tracking-tight">{(network.qty_fresh_sold || 0) + (network.qty_disc_sold || 0)}</div>
                                            <Activity className="absolute right-4 bottom-4 text-[#1ABB9C] opacity-10" size={48} />
                                        </div>
                                        <div className="x-panel !p-5 flex flex-col relative overflow-hidden group bg-red-50/30 border-red-100">
                                            <div className="text-[10px] uppercase font-black text-[#E74856] tracking-widest mb-2 relative z-10">Списано в Мусор</div>
                                            <div className="text-3xl font-bold relative z-10 text-[#E74856] tracking-tight">{network.qty_waste || 0}</div>
                                            <AlertTriangle className="absolute right-4 bottom-4 text-[#E74856] opacity-10" size={48} />
                                        </div>
                                        <div className="x-panel !p-5 flex flex-col relative overflow-hidden group justify-between">
                                            <div className="text-[10px] uppercase font-black text-[#2b80ff] tracking-widest mb-3 relative z-10">Дисципліна Цеху</div>
                                            <div className="flex items-end gap-2 text-[#2b80ff]">
                                                <div className="text-3xl font-bold relative z-10 leading-none tracking-tight">{network.average_fill_rate || 0}%</div>
                                                <div className="text-[9px] uppercase font-black tracking-widest pb-1 opacity-80">Fill Rate</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="x-panel !p-5 bg-red-50/10 border-red-200">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="p-1.5 bg-red-100 text-[#E74856] rounded-lg"><AlertTriangle size={18} /></div>
                                                <div className="text-[10px] uppercase font-black text-[#E74856] tracking-widest">Списання (грн)</div>
                                            </div>
                                            <div className="text-2xl font-bold text-[#E74856] tracking-tight mt-1">
                                                {(network.waste_uah || 0).toLocaleString('uk-UA')} <span className="text-xs font-normal text-gray-500 font-sans">грн</span>
                                            </div>
                                        </div>
                                        <div className="x-panel !p-5 bg-orange-50/10 border-orange-200">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="p-1.5 bg-orange-100 text-orange-600 rounded-lg"><TrendingDown size={18} /></div>
                                                <div className="text-[10px] uppercase font-black text-orange-600 tracking-widest">Втрачений Виторг</div>
                                            </div>
                                            <div className="text-2xl font-bold text-orange-600 tracking-tight mt-1">
                                                ≈{(network.lost_revenue_potential ?? network.lost_revenue ?? 0).toLocaleString('uk-UA')} <span className="text-xs font-normal text-gray-500 font-sans">грн</span>
                                            </div>
                                        </div>
                                        <div className="x-panel !p-5 flex flex-col justify-center">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] text-gray-400 font-black uppercase">Waste Rate</span>
                                                <span className="text-lg font-bold text-[#E74856]">{network.waste_rate || 0}%</span>
                                            </div>
                                            <div className="w-full bg-red-50 h-1.5 rounded-full overflow-hidden mb-3">
                                                <div className="bg-[#E74856] h-full" style={{ width: `${network.waste_rate || 0}%` }}></div>
                                            </div>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] text-gray-400 font-black uppercase">Sell-Through</span>
                                                <span className="text-lg font-bold text-[#1ABB9C]">{network.sell_through_rate || 0}%</span>
                                            </div>
                                            <div className="w-full bg-emerald-50 h-1.5 rounded-full overflow-hidden">
                                                <div className="bg-[#1ABB9C] h-full" style={{ width: `${network.sell_through_rate || 0}%` }}></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="x-panel !p-0 border border-gray-200 overflow-hidden mt-6">
                                        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                                            <h3 className="text-xs font-black uppercase tracking-widest text-[#2A3F54] flex items-center gap-2">
                                                <Store size={18} /> Деталізація по Магазинах
                                                稳定
                                            </h3>
                                            <div className="flex bg-white rounded-lg border border-gray-200 p-1">
                                                <button onClick={() => setMetricMode('qty')} className={cn("px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all", metricMode === 'qty' ? "bg-gray-100 text-[#2A3F54]" : "text-gray-400")}>ШТ.</button>
                                                <button onClick={() => setMetricMode('revenue')} className={cn("px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all", metricMode === 'revenue' ? "bg-gray-100 text-[#2A3F54]" : "text-gray-400")}>ГРН.</button>
                                            </div>
                                        </div>
                                        <div className="overflow-auto max-h-[500px]">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                                                        <th className="py-3 px-6 text-[10px] font-black uppercase text-gray-400">Магазин</th>
                                                        <th className="py-3 px-6 text-[10px] font-black uppercase text-[#1ABB9C] text-right">Фреш</th>
                                                        <th className="py-3 px-6 text-[10px] font-black uppercase text-[#1ABB9C] text-right">Дисконт</th>
                                                        <th className="py-3 px-6 text-[10px] font-black uppercase text-[#E74856] text-right">Списання</th>
                                                        <th className="py-3 px-6 text-[10px] font-black uppercase text-gray-600 text-right">Всього</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(ranking.all_stores || []).map((store: any, idx: number) => (
                                                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors bg-white">
                                                            <td className="py-3 px-6 text-sm font-bold text-[#2A3F54]">{store.store_name}</td>
                                                            <td className="py-3 px-6 text-right text-[#1ABB9C] font-bold">{(metricMode === 'qty' ? store.fresh_sold : store.revenue_fresh || 0).toLocaleString('uk-UA')}</td>
                                                            <td className="py-3 px-6 text-right text-[#1ABB9C] font-medium opacity-80">{(metricMode === 'qty' ? store.disc_sold : store.revenue_disc || 0).toLocaleString('uk-UA')}</td>
                                                            <td className="py-3 px-6 text-right text-[#E74856] font-bold">{(metricMode === 'qty' ? store.total_waste : store.waste_uah || 0).toLocaleString('uk-UA')}</td>
                                                            <td className="py-3 px-6 text-right text-[#2A3F54] font-black bg-gray-50/30">{(metricMode === 'qty' ? store.total_sold : (store.revenue_fresh || 0) + (store.revenue_disc || 0)).toLocaleString('uk-UA')}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* RANKING TAB */}
                            {activeTab === 'ranking' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 border-l-2 border-[#1ABB9C] pl-3">Аналіз Магазинів та Асортименту</h3>
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                        <div className="space-y-6">
                                            <div className="x-panel !p-0 border border-emerald-100 overflow-hidden">
                                                <div className="bg-emerald-50 border-b border-emerald-100 p-4 text-[#1ABB9C] font-black text-xs uppercase tracking-widest flex items-center gap-2">
                                                    <ArrowUpRight size={18} /> Топ-5 Магазинів
                                                </div>
                                                <div className="p-3 space-y-2 bg-white">
                                                    {(ranking.top_stores || []).map((s: any, i: number) => (
                                                        <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-gray-50 border border-gray-100">
                                                            <span className="font-bold text-[#2A3F54] text-sm">{s.store_name}</span>
                                                            <span className="text-[#1ABB9C] font-black">{s.total_sold} <span className="text-[10px] font-normal text-gray-400 uppercase">шт</span></span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="x-panel !p-0 border border-red-100 overflow-hidden">
                                                <div className="bg-red-50 border-b border-red-100 p-4 text-[#E74856] font-black text-xs uppercase tracking-widest flex items-center gap-2">
                                                    <ArrowDownRight size={18} /> Аутсайдери
                                                </div>
                                                <div className="p-3 space-y-2 bg-white">
                                                    {(ranking.bottom_stores || []).map((s: any, i: number) => (
                                                        <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-gray-50 border border-gray-100">
                                                            <span className="font-bold text-[#2A3F54] text-sm">{s.store_name}</span>
                                                            <span className="text-[#E74856] font-black">{s.total_sold} <span className="text-[10px] font-normal text-gray-400 uppercase">шт</span></span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="lg:col-span-2">
                                            <div className="x-panel !p-0 border border-gray-200 overflow-hidden h-full flex flex-col">
                                                <div className="bg-gray-50 border-b border-gray-100 p-4 text-[#2A3F54] font-black text-xs uppercase tracking-widest flex items-center gap-2">
                                                    <Activity size={18} /> ABC-Аналіз SKU
                                                </div>
                                                <div className="p-4 flex-1 overflow-auto bg-white">
                                                    <div className="space-y-3">
                                                        {(ranking.sku_abc || []).map((s: any, i: number) => (
                                                            <div key={i} className="flex items-center p-4 rounded-xl bg-gray-50 border border-gray-100 gap-5 hover:border-[#1ABB9C] transition-all group">
                                                                <div className={cn(
                                                                    "w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg",
                                                                    i === 0 ? "bg-amber-100 text-amber-600" :
                                                                        i === 1 ? "bg-gray-200 text-gray-600" :
                                                                            i === 2 ? "bg-orange-100 text-orange-600" : "bg-white text-gray-400 border border-gray-200"
                                                                )}>{i + 1}</div>
                                                                <div className="flex-1">
                                                                    <span className="font-bold text-[#2A3F54] text-base group-hover:text-[#1ABB9C] transition-colors">{s.sku_name}</span>
                                                                </div>
                                                                <div className="flex items-center gap-4 text-right">
                                                                    <div>
                                                                        <div className="text-[9px] text-gray-400 uppercase font-black">Виручка</div>
                                                                        <div className="font-black text-[#1ABB9C]">{s.total_revenue?.toLocaleString('uk-UA')} <span className="text-[10px] font-normal">грн</span></div>
                                                                    </div>
                                                                    <div className="w-px h-8 bg-gray-200"></div>
                                                                    <div>
                                                                        <div className="text-[9px] text-gray-400 uppercase font-black">Waste</div>
                                                                        <div className="font-black text-[#E74856]">{(s.waste_uah || 0).toLocaleString('uk-UA')} <span className="text-[10px] font-normal">грн</span></div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* DISCOUNT HEALTH TAB */}
                            {activeTab === 'discount' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 border-l-2 border-[#1ABB9C] pl-3">Здоров'я Дисконту</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="x-panel !p-5 bg-amber-50/30 border-amber-100">
                                            <div className="flex items-center justify-between mb-4">
                                                <h4 className="text-[10px] uppercase font-black text-amber-600 tracking-widest">Каннібалізація Мережі</h4>
                                                <AlertCircle size={20} className="text-amber-500" />
                                            </div>
                                            <div className="text-5xl font-black text-amber-600 tracking-tighter mb-2">{network.cannibalization_pct ?? network.cannibalization_rate ?? 0}%</div>
                                            <p className="text-xs text-amber-700/70 font-medium">Частка покупок зі знижкою у загальних продажах.</p>
                                        </div>
                                        <div className="x-panel !p-5 bg-blue-50/30 border-blue-100">
                                            <h4 className="text-[10px] uppercase font-black text-blue-600 tracking-widest mb-4">Playbook</h4>
                                            <div className="space-y-2 text-xs text-blue-700 font-medium">
                                                <p className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> {">"}30%: Скоротити вечірні поставки на 15%.</p>
                                                <p className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> 20-30%: Моніторинг залишків о 18:00.</p>
                                                <p className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {"<"}20%: Оптимальна модель.</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="x-panel !p-0 border border-gray-200 overflow-hidden">
                                        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                                            <h3 className="text-xs font-black uppercase tracking-widest text-[#2A3F54]">Ренкінг Магазинів по Каннібалізації</h3>
                                        </div>
                                        <div className="overflow-auto max-h-[500px]">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                                                        <th className="py-3 px-6 text-[10px] font-black uppercase text-gray-400">Магазин</th>
                                                        <th className="py-3 px-6 text-[10px] font-black uppercase text-gray-400 text-right">Всього (шт)</th>
                                                        <th className="py-3 px-6 text-[10px] font-black uppercase text-gray-400 text-right">Дисконт (шт)</th>
                                                        <th className="py-3 px-6 text-[10px] font-black uppercase text-gray-400 text-right">Індекс %</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {discountHealth.map((row: any, idx: number) => {
                                                        const rate = row.cannibalization_pct ?? row.cannibalization_rate ?? 0;
                                                        return (
                                                            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors bg-white">
                                                                <td className="py-3 px-6 text-sm font-bold text-[#2A3F54]">{row.store_name}</td>
                                                                <td className="py-3 px-6 text-right text-gray-600 font-medium">{row.total_sold}</td>
                                                                <td className="py-3 px-6 text-right text-amber-600 font-bold">{row.disc_sold || 0}</td>
                                                                <td className="py-3 px-6 text-right">
                                                                    <span className={cn("inline-block px-2 py-1 rounded text-xs font-black", rate > 30 ? "bg-red-50 text-red-600" : rate > 20 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>
                                                                        {rate.toFixed(1)}%
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TREND TAB */}
                            {activeTab === 'trend' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 border-l-2 border-[#1ABB9C] pl-3">Матриця Здоров'я: Тренд Індекси</h3>
                                    <div className="x-panel !p-0 border border-gray-200 overflow-hidden">
                                        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                                            <h3 className="text-xs font-black uppercase tracking-widest text-[#2A3F54] flex items-center gap-2">
                                                <TrendingUp size={18} /> Тренд Продажів (14д vs 14д)
                                            </h3>
                                        </div>
                                        <div className="overflow-auto max-h-[600px]">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                                                        <th className="py-3 px-6 text-[10px] font-black uppercase text-gray-400">Магазин</th>
                                                        <th className="py-3 px-6 text-[10px] font-black uppercase text-gray-400">Товар</th>
                                                        <th className="py-3 px-6 text-[10px] font-black uppercase text-gray-400 text-center">Fill Rate</th>
                                                        <th className="py-3 px-6 text-[10px] font-black uppercase text-gray-400 text-right">Тренд Індекс</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {trends.map((row: any, idx: number) => {
                                                        const trend = row.trend_index || 1;
                                                        return (
                                                            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors bg-white">
                                                                <td className="py-3 px-6 text-sm font-bold text-[#2A3F54]">{row.store_name}</td>
                                                                <td className="py-3 px-6 text-sm text-gray-600 font-medium">{row.sku_name}</td>
                                                                <td className="py-3 px-6 text-center text-xs font-black">
                                                                    <span className={cn(row.fill_rate < 90 ? "text-red-600" : "text-gray-400")}>{row.fill_rate || 95}%</span>
                                                                </td>
                                                                <td className="py-3 px-6 text-right">
                                                                    <span className={cn("inline-flex items-center gap-1 font-black text-sm", trend > 1.1 ? "text-[#1ABB9C]" : trend < 0.85 ? "text-[#E74856]" : "text-gray-400")}>
                                                                        {trend > 1.1 ? <TrendingUp size={14} /> : trend < 0.85 ? <TrendingDown size={14} /> : null}
                                                                        {trend.toFixed(2)}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* CATALOG TAB */}
                            {activeTab === 'catalog' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 border-l-2 border-[#1ABB9C] pl-3">Каталог Товарів</h3>
                                    {catalogLoading ? (
                                        <div className="flex h-[400px] items-center justify-center"><Loader2 className="animate-spin text-[#1ABB9C] size-8" /></div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
                                            {(catalogData?.cards || []).map((sku: any, idx: number) => (
                                                <div key={idx} onClick={() => setSelectedSku({ id: sku.sku_id, name: sku.sku_name })} className="x-panel !p-4 transition-all flex flex-col gap-2 group hover:border-[#2b80ff] cursor-pointer bg-white relative overflow-hidden">
                                                    <div className="flex justify-between items-start">
                                                        <h3 className="text-xs font-black text-[#2A3F54] group-hover:text-[#2b80ff] transition-colors leading-tight line-clamp-2 uppercase">{sku.sku_name}</h3>
                                                        <div className={cn("w-2 h-2 rounded-full flex-shrink-0 mt-1", sku.waste_pct > 15 ? "bg-[#E74856]" : "bg-[#1ABB9C]")}></div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 my-1">
                                                        <div>
                                                            <div className="text-[9px] uppercase font-black text-gray-400 mb-0">Продажі</div>
                                                            <div className="text-2xl font-black text-[#2A3F54] leading-none">{sku.total_sold} <span className="text-xs font-medium opacity-50">шт</span></div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[9px] uppercase font-black text-gray-400 mb-0">Сер./дн</div>
                                                            <div className="text-2xl font-black text-[#73879C] leading-none">{sku.avg_daily_sold} <span className="text-xs font-medium opacity-50">шт</span></div>
                                                        </div>
                                                    </div>
                                                    <div className="pt-2 border-t border-gray-100 flex justify-between items-center mt-auto">
                                                        <div className="text-[9px] uppercase font-black text-gray-400">Waste / Discount</div>
                                                        <div className="flex gap-2">
                                                            <span className={cn("font-black text-[10px] px-1.5 py-0.5 rounded", sku.waste_pct > 15 ? "bg-red-50 text-[#E74856]" : "bg-gray-50 text-gray-500")}>W: {sku.waste_pct}%</span>
                                                            <span className="font-black text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-[#1ABB9C]">D: {sku.disc_pct}%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* MODAL FOR SKU DRAWER */}
                {selectedSku && (
                    <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/60 backdrop-blur-sm transition-opacity">
                        <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-black text-[#2A3F54] uppercase tracking-tight">{selectedSku.name}</h3>
                                    <p className="text-[10px] text-gray-400 font-black tracking-widest uppercase">Аналіз по магазинах ({startDate} - {endDate})</p>
                                </div>
                                <button onClick={() => setSelectedSku(null)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"><X size={24} /></button>
                            </div>
                            <div className="flex-1 overflow-auto p-6 bg-gray-50/50">
                                {storesLoading ? (
                                    <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-[#1ABB9C] size-8" /></div>
                                ) : (
                                    <div className="space-y-4">
                                        {(storesData?.stores || []).map((store: any, idx: number) => (
                                            <div key={idx} className="x-panel !p-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white border border-gray-100">
                                                <div className="flex items-center gap-4 flex-1">
                                                    <div className="w-10 h-10 rounded-lg bg-gray-100 text-[#2A3F54] flex items-center justify-center shrink-0"><Store size={20} /></div>
                                                    <div>
                                                        <div className="font-black text-[#2A3F54] text-sm uppercase">{store.store_name}</div>
                                                        <div className="text-[9px] text-gray-400 font-black uppercase">ID: {store.store_id}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-6 shrink-0">
                                                    <div className="text-right">
                                                        <div className="text-[9px] text-gray-400 uppercase font-black">Продано</div>
                                                        <div className="font-black text-[#1ABB9C] text-lg">{store.total_sold} <span className="text-[10px] font-normal">шт</span></div>
                                                    </div>
                                                    <div className="w-px h-8 bg-gray-200"></div>
                                                    <div className="text-right">
                                                        <div className="text-[9px] text-gray-400 uppercase font-black">Waste</div>
                                                        <div className={cn("font-black text-lg", store.waste_pct > 15 ? "text-[#E74856]" : "text-amber-500")}>{store.waste_pct}%</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function BakeryPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#F7F7F7] flex justify-center items-center"><Loader2 className="animate-spin text-[#2b80ff] size-8" /></div>}>
            <BakeryDashboard />
        </Suspense>
    );
}
