'use client';

import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    PieChart, Pie, Cell, RadialBarChart, RadialBar, Legend, ComposedChart, Line
} from 'recharts';
import { TrendingUp, AlertTriangle, CheckCircle2, TrendingDown, Target, Package, Layers } from 'lucide-react';
import { ProductionTask } from '@/types/bi';
import { normalizeKonditerkaUnit } from '@/lib/konditerka-dictionary';

// Theme Colors
const COLORS = [
    '#00D4FF', // Cyan
    '#0088FF', // Blue
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#8B5CF6', // Purple
    '#EF4444', // Red
    '#14B8A6', // Teal
];

interface KonditerkaAnalyticsDashboardProps {
    data: ProductionTask[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trends?: any[];
}

export const KonditerkaAnalyticsDashboard: React.FC<KonditerkaAnalyticsDashboardProps> = ({ data, trends = [] }) => {

    // ------------------------------------------------------------------------
    // 1. GLOBAL KPIs
    // ------------------------------------------------------------------------
    const kpis = useMemo(() => {
        let totalStockKg = 0;
        let totalNormKg = 0;
        let totalDailyDemandKg = 0;
        let totalDeficitKg = 0;

        data.forEach(product => {
            // Because data is already transformed by transformKonditerkaData, 
            // the kg/sht metrics are accurately scaled for the UI.
            totalStockKg += product.totalStockKg || 0;
            totalNormKg += product.minStockThresholdKg || 0;
            totalDailyDemandKg += product.dailyForecastKg || 0;

            // Deficit per product across all stores
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const deficit = product.stores?.reduce((sum: number, store: any) => sum + (store.deficitKg || 0), 0) || 0;
            totalDeficitKg += deficit;
        });

        const fillIndex = totalNormKg > 0 ? (totalStockKg / totalNormKg) * 100 : 0;
        // Cap index at 100% for display purposes or let it show overstock? Usually it's nice to see overstock.

        return {
            totalStockKg,
            totalNormKg,
            totalDailyDemandKg,
            totalDeficitKg,
            fillIndex
        };
    }, [data]);

    // ------------------------------------------------------------------------
    // 2. TOP PRODUCTS BY DEMAND (Top 10)
    // ------------------------------------------------------------------------
    const topProductsData = useMemo(() => {
        return [...data]
            .sort((a, b) => (b.dailyForecastKg || 0) - (a.dailyForecastKg || 0))
            .slice(0, 10)
            .map(p => ({
                name: p.name.replace('Десерт ', '').replace('Морозиво ', '').substring(0, 20),
                fullName: p.name,
                demand: Number((p.dailyForecastKg || 0).toFixed(1)),
                stock: Number((p.totalStockKg || 0).toFixed(1)),
                unit: p.unit
            }));
    }, [data]);

    // ------------------------------------------------------------------------
    // 3. STORE DISTRIBUTION HEALTH (Deficit by Store)
    // ------------------------------------------------------------------------
    const storeHealthData = useMemo(() => {
        const storeMap = new Map<string, { storeName: string; deficit: number; norm: number; stock: number }>();

        data.forEach(product => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            product.stores?.forEach((store: any) => {
                const sName = store.storeName.replace('Магазин ', '').replace('"', '').replace('"', '').trim();
                if (!storeMap.has(sName)) {
                    storeMap.set(sName, { storeName: sName, deficit: 0, norm: 0, stock: 0 });
                }
                const existing = storeMap.get(sName)!;
                existing.deficit += store.deficitKg || 0;
                existing.norm += store.minStock || 0;
                existing.stock += store.currentStock || 0;
            });
        });

        // Calculate fill rate per store and return sorted by lowest fill rate
        return Array.from(storeMap.values())
            .map(s => {
                const fillRate = s.norm > 0 ? (s.stock / s.norm) * 100 : 100;
                return {
                    ...s,
                    fillRate: Number(Math.min(100, Math.max(0, fillRate)).toFixed(1)),
                    deficit: Number(s.deficit.toFixed(1))
                };
            })
            // Sort by deficit amount primarily
            .sort((a, b) => b.deficit - a.deficit)
            .slice(0, 10);
    }, [data]);

    // ------------------------------------------------------------------------
    // 4. CATEGORY BREAKDOWN
    // ------------------------------------------------------------------------
    const categoryData = useMemo(() => {
        let iceCreamCount = 0;
        let dessertCount = 0;
        let weightCount = 0;

        data.forEach(p => {
            const isIceCream = p.name.toLowerCase().includes('морозив') || p.name.toLowerCase().includes('сорбет');
            const isWeight = p.unit === 'кг';

            // We'll map demand to see what drives the highest volume (or stock value)
            const demandValue = p.dailyForecastKg || 1; // Fallback to 1 to count items if no demand

            if (isIceCream) iceCreamCount += demandValue;
            else if (isWeight) weightCount += demandValue;
            else dessertCount += demandValue;
        });

        return [
            { name: 'Десерти (шт)', value: Number(dessertCount.toFixed(1)), fill: COLORS[0] },
            { name: 'Морозиво (шт)', value: Number(iceCreamCount.toFixed(1)), fill: COLORS[4] },
            { name: 'Вагові вироби (кг)', value: Number(weightCount.toFixed(1)), fill: COLORS[3] }
        ].filter(c => c.value > 0);
    }, [data]);

    // ------------------------------------------------------------------------
    // 5. TRENDS COMPARISON (Last 7 Days vs Previous 7 Days)
    // ------------------------------------------------------------------------
    const trendsChartData = useMemo(() => {
        if (!trends || trends.length === 0) return [];
        return trends.slice(0, 15).map(t => {
            const unit = normalizeKonditerkaUnit(t.unit, t.product_name);
            const multiplier = unit === 'кг' ? 0.001 : 1;

            const current = (t.qty_last_7 || 0) * multiplier;
            const previous = (t.qty_prev_7 || 0) * multiplier;

            return {
                name: t.product_name.replace('Десерт ', '').replace('Морозиво ', '').substring(0, 20),
                fullName: t.product_name,
                current: Number(current.toFixed(1)),
                previous: Number(previous.toFixed(1)),
                unit
            };
        });
    }, [trends]);


    // ------------------------------------------------------------------------
    // RENDER HELPERS
    // ------------------------------------------------------------------------
    const formatNumber = (val: number) => new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 }).format(val);

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* KPI ROW */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Global Index */}
                <div className="bg-[#141B2D]/80 border border-[#00D4FF]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#00D4FF]/50 transition-colors">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Target size={64} className="text-[#00D4FF]" />
                    </div>
                    <p className="text-[#00D4FF] text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                        Індекс Заповненості
                    </p>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-4xl font-black text-white">{kpis.fillIndex.toFixed(0)}</h3>
                        <span className="text-xl text-white/50">%</span>
                    </div>
                    <div className="mt-4 text-xs font-semibold text-white/40 uppercase tracking-widest flex items-center justify-between">
                        <span>Факт: {formatNumber(kpis.totalStockKg)}</span>
                        <span>Норма: {formatNumber(kpis.totalNormKg)}</span>
                    </div>
                    {/* Progress Bar inside KPI */}
                    <div className="w-full bg-white/5 rounded-full h-1.5 mt-3 overflow-hidden">
                        <div
                            className="h-full bg-[#00D4FF] shadow-[0_0_10px_#00D4FF]"
                            style={{ width: `${Math.min(100, kpis.fillIndex)}%` }}
                        />
                    </div>
                </div>

                {/* Total Demand */}
                <div className="bg-[#141B2D]/80 border border-[#10B981]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#10B981]/50 transition-colors">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingUp size={64} className="text-[#10B981]" />
                    </div>
                    <p className="text-[#10B981] text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                        Прогноз попиту (день)
                    </p>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-4xl font-black text-white">{formatNumber(kpis.totalDailyDemandKg)}</h3>
                        <span className="text-sm text-white/50">од/кг</span>
                    </div>
                    <div className="mt-4 text-[10px] font-semibold text-emerald-400/70 uppercase tracking-widest flex items-center gap-1">
                        <CheckCircle2 size={12} /> Середньоденний темп
                    </div>
                </div>

                {/* Total Deficit */}
                <div className="bg-[#141B2D]/80 border border-[#EF4444]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#EF4444]/50 transition-colors">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <AlertTriangle size={64} className="text-[#EF4444]" />
                    </div>
                    <p className="text-[#EF4444] text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                        Загальний Дефіцит
                    </p>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-4xl font-black text-white">{formatNumber(kpis.totalDeficitKg)}</h3>
                        <span className="text-sm text-white/50">од/кг</span>
                    </div>
                    <div className="mt-4 text-[10px] font-semibold text-red-400/70 uppercase tracking-widest flex items-center gap-1">
                        <TrendingDown size={12} /> Потребує виробництва
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-1.5 mt-3 overflow-hidden">
                        <div
                            className="h-full bg-[#EF4444] shadow-[0_0_10px_#EF4444]"
                            style={{ width: `${Math.min(100, (kpis.totalDeficitKg / (kpis.totalNormKg || 1)) * 100)}%` }}
                        />
                    </div>
                </div>

                {/* Unique SKUs */}
                <div className="bg-[#141B2D]/80 border border-[#F59E0B]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#F59E0B]/50 transition-colors">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Package size={64} className="text-[#F59E0B]" />
                    </div>
                    <p className="text-[#F59E0B] text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                        Активні Позиції
                    </p>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-4xl font-black text-white">{data.length}</h3>
                        <span className="text-sm text-white/50">SKU</span>
                    </div>
                    <div className="mt-4 text-[10px] font-semibold text-amber-400/70 uppercase tracking-widest flex items-center gap-1">
                        <Layers size={12} /> В асортименті
                    </div>
                </div>
            </div>

            {/* CHARTS ROW 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* TOP PRODUCTS CHART */}
                <div className="lg:col-span-2 bg-[#141B2D]/60 border border-white/5 rounded-2xl p-6">
                    <div className="mb-6 flex items-center justify-between">
                        <div>
                            <h3 className="text-white font-bold tracking-wide">ТОП Продуктів за Попитом</h3>
                            <p className="text-xs text-white/40 uppercase tracking-widest">Найбільш популярні товарні позиції</p>
                        </div>
                    </div>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topProductsData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    stroke="rgba(255,255,255,0.2)"
                                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                    angle={-45}
                                    textAnchor="end"
                                />
                                <YAxis
                                    stroke="rgba(255,255,255,0.2)"
                                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <RechartsTooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-[#0a0e27] border border-[#00D4FF]/30 p-3 rounded-lg shadow-xl">
                                                    <p className="text-white font-bold mb-2">{data.fullName}</p>
                                                    <div className="space-y-1 text-sm">
                                                        <p className="text-[#10B981]">Попит: {data.demand} {data.unit}</p>
                                                        <p className="text-[#00D4FF]">Наявність: {data.stock} {data.unit}</p>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar dataKey="demand" name="Попит" fill="#10B981" radius={[4, 4, 0, 0]} barSize={20} />
                                <Bar dataKey="stock" name="Залишок" fill="#00D4FF" radius={[4, 4, 0, 0]} barSize={20} opacity={0.6} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* CATEGORY DONUT */}
                <div className="bg-[#141B2D]/60 border border-white/5 rounded-2xl p-6 flex flex-col items-center">
                    <div className="w-full text-left mb-2">
                        <h3 className="text-white font-bold tracking-wide">Структура попиту</h3>
                        <p className="text-xs text-white/40 uppercase tracking-widest">Розподіл за категоріями</p>
                    </div>
                    <div className="h-[300px] w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    innerRadius={70}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Pie>
                                <RechartsTooltip
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className="bg-[#0a0e27] border border-white/10 p-2 rounded shadow-xl text-sm font-semibold text-white">
                                                    {payload[0].name}: {payload[0].value}
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Legend
                                    verticalAlign="bottom"
                                    height={36}
                                    iconType="circle"
                                    formatter={(value) => <span className="text-white/70 text-xs">{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>

            {/* CHARTS ROW 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">

                {/* STORE HEATMAP / LIST */}
                <div className="bg-[#141B2D]/60 border border-white/5 rounded-2xl p-6">
                    <div className="mb-6">
                        <h3 className="text-white font-bold tracking-wide">Дефіцит по магазинах</h3>
                        <p className="text-xs text-white/40 uppercase tracking-widest">Топ точок за нестачею продукції</p>
                    </div>

                    <div className="space-y-4">
                        {storeHealthData.map((store, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <span className="text-white/30 text-xs w-4">{i + 1}</span>
                                <div className="flex-1">
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-medium text-white">{store.storeName}</span>
                                        <span className="text-xs font-bold text-[#EF4444]">{store.deficit} деф.</span>
                                    </div>
                                    <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden flex">
                                        <div
                                            className="h-full bg-[#10B981]"
                                            style={{ width: `${store.fillRate}%` }}
                                        />
                                        <div
                                            className="h-full bg-[#EF4444] opacity-50"
                                            style={{ width: `${100 - store.fillRate}%` }}
                                        />
                                    </div>
                                    <div className="text-[9px] text-white/40 mt-1 uppercase tracking-widest">
                                        Заповненість {store.fillRate}%
                                    </div>
                                </div>
                            </div>
                        ))}
                        {storeHealthData.length === 0 && (
                            <div className="text-center py-8 text-white/40 text-sm">Дані про магазини відсутні</div>
                        )}
                    </div>
                </div>

                {/* OVERALL FILL RATE GAUGE */}
                <div className="bg-[#141B2D]/60 border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center relative overflow-hidden">
                    {/* Background Glow */}
                    <div className="absolute inset-0 bg-radial-gradient from-[#00D4FF]/5 to-transparent pointer-events-none" />

                    <div className="text-center mb-8 z-10 w-full">
                        <h3 className="text-white font-bold tracking-wide">Рівень Забезпечення Мережі</h3>
                        <p className="text-xs text-white/40 uppercase tracking-widest">Загальне здоров&apos;я вітрин</p>
                    </div>

                    <div className="h-[250px] w-full z-10 relative flex justify-center items-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadialBarChart
                                cx="50%"
                                cy="50%"
                                innerRadius="70%"
                                outerRadius="100%"
                                barSize={20}
                                data={[
                                    { name: 'Norm', value: 100, fill: 'rgba(255,255,255,0.05)' },
                                    { name: 'Fill', value: Math.min(100, kpis.fillIndex), fill: '#00D4FF' }
                                ]}
                                startAngle={180}
                                endAngle={0}
                            >
                                <RadialBar
                                    background={false}
                                    dataKey="value"
                                    cornerRadius={10}
                                />
                            </RadialBarChart>
                        </ResponsiveContainer>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-[-10px] text-center">
                            <h2 className="text-5xl font-black text-white">{kpis.fillIndex.toFixed(0)}<span className="text-2xl text-[#00D4FF]">%</span></h2>
                            <p className="text-xs text-[#00D4FF] uppercase tracking-widest mt-1">Виконання норми</p>
                        </div>
                    </div>

                </div>

            </div>

            {/* CHARTS ROW 3 (TRENDS) */}
            {trendsChartData.length > 0 && (
                <div className="grid grid-cols-1 gap-6 mt-6">
                    <div className="bg-[#141B2D]/60 border border-white/5 rounded-2xl p-6">
                        <div className="mb-6 flex items-center justify-between">
                            <div>
                                <h3 className="text-white font-bold tracking-wide flex items-center gap-2">
                                    <TrendingUp size={18} className="text-[#F59E0B]" />
                                    Динаміка продажу
                                </h3>
                                <p className="text-xs text-white/40 uppercase tracking-widest">Останні 7 днів порівняно з попередніми 7 днями</p>
                            </div>
                        </div>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={trendsChartData} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        stroke="rgba(255,255,255,0.2)"
                                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
                                        axisLine={false}
                                        tickLine={false}
                                        angle={-45}
                                        textAnchor="end"
                                    />
                                    <YAxis
                                        stroke="rgba(255,255,255,0.2)"
                                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <RechartsTooltip
                                        cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const data = payload[0].payload;
                                                const diff = data.current - data.previous;
                                                const diffFormatted = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
                                                const diffColor = diff > 0 ? 'text-[#10B981]' : (diff < 0 ? 'text-[#EF4444]' : 'text-white/50');

                                                return (
                                                    <div className="bg-[#0a0e27] border border-[#00D4FF]/30 p-3 rounded-lg shadow-xl">
                                                        <p className="text-white font-bold mb-2">{data.fullName}</p>
                                                        <div className="space-y-1 text-sm">
                                                            <p className="text-[#F59E0B]">Поточні 7 дн: {data.current} {data.unit}</p>
                                                            <p className="text-white/50">Попередні 7 дн: {data.previous} {data.unit}</p>
                                                            <p className={`font-bold mt-2 ${diffColor}`}>Різниця: {diffFormatted} {data.unit}</p>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="current" name="Останні 7 днів" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={20} />
                                    <Line type="monotone" dataKey="previous" name="Попередні 7 днів" stroke="rgba(255,255,255,0.4)" strokeWidth={3} dot={{ r: 4, fill: '#141B2D', stroke: 'rgba(255,255,255,0.4)', strokeWidth: 2 }} activeDot={{ r: 6, fill: '#00D4FF' }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
