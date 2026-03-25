'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Truck, ShoppingBag, PackageX, Percent, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function BakeryAdminOverview() {
    // Temporary hardcoded dates for phase 1. Phase 1 plan says add a global context later.
    const [startDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 14);
        return d.toISOString().split('T')[0];
    });
    const [endDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    });
    const periodQuery = `start_date=${startDate}&end_date=${endDate}`;

    const { data: apiData, isLoading, error } = useSWR(`/api/bakery/analytics?${periodQuery}`, fetcher);

    const network = apiData?.network || {};
    const ranking = apiData?.ranking || {};

    const chartData = (ranking.sku_abc || []).slice(0, 10).map((s: any) => ({
        name: s.sku_name.length > 15 ? s.sku_name.slice(0, 15) + '...' : s.sku_name,
        revenue: s.total_revenue,
        fullName: s.sku_name,
        sold: s.total_sold
    }));

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center text-gray-500">Завантаження аналітики...</div>;
    }

    if (error) {
        return (
            <div className="p-8 flex flex-col items-center justify-center gap-3 text-center">
                <AlertTriangle size={32} className="text-red-400" />
                <p className="text-gray-600 font-medium">Не вдалось завантажити аналітику</p>
                <p className="text-sm text-gray-400">{error.message || 'Спробуйте перезавантажити сторінку'}</p>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in duration-300">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Overview</h1>
                <div className="text-sm text-gray-500">
                    Дані за період: {startDate} — {endDate}
                </div>
            </div>

            {/* Top Tiles (AdminLTE style) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded shadow-sm border border-gray-100 p-4 transition hover:shadow-md">
                    <div className="flex items-center gap-3 mb-2 text-gray-500">
                        <Truck size={20} className="text-blue-500" />
                        <span className="text-sm font-medium uppercase tracking-wider">Привезено (шт)</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-800">
                        {network.total_delivered?.toLocaleString('uk-UA')}
                    </div>
                </div>

                <div className="bg-white rounded shadow-sm border border-gray-100 p-4 transition hover:shadow-md border-l-4 border-l-emerald-500">
                    <div className="flex items-center gap-3 mb-2 text-gray-500">
                        <ShoppingBag size={20} className="text-emerald-500" />
                        <span className="text-sm font-medium uppercase tracking-wider">Разом продано (шт)</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-800">
                        {network.total_sold?.toLocaleString('uk-UA')}
                    </div>
                </div>

                <div className="bg-white rounded shadow-sm border border-gray-100 p-4 transition hover:shadow-md border-l-4 border-l-red-500">
                    <div className="flex items-center gap-3 mb-2 text-gray-500">
                        <PackageX size={20} className="text-red-500" />
                        <span className="text-sm font-medium uppercase tracking-wider">Списання (шт)</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-800">
                        {network.total_waste?.toLocaleString('uk-UA')}
                    </div>
                    <div className="text-xs text-red-500 font-bold mt-1">{(network.waste_pct)?.toFixed(1)}%</div>
                </div>

                <div className="bg-white rounded shadow-sm border border-gray-100 p-4 transition hover:shadow-md">
                    <div className="flex items-center gap-3 mb-2 text-gray-500">
                        <Percent size={20} className="text-yellow-500" />
                        <span className="text-sm font-medium uppercase tracking-wider">Каннібалізація</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-800">
                        {network.cannibalization_pct?.toFixed(1) ?? network.cannibalization_rate?.toFixed(1) ?? 0}%
                    </div>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Main Graph Panel */}
                <div className="lg:col-span-2 bg-white rounded shadow-sm border border-gray-100">
                    <div className="p-4 border-b border-gray-100">
                        <h2 className="text-base font-semibold text-gray-700">Топ-10 SKU (Виручка)</h2>
                    </div>
                    <div className="p-4">
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEEEEE" />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#9E9E9E', fontSize: 11 }}
                                        dy={10}
                                        interval={0}
                                        angle={-45}
                                        textAnchor="end"
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        width={60}
                                        tick={{ fill: '#9E9E9E', fontSize: 12 }}
                                        tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                                    />
                                    <Tooltip
                                        cursor={{ fill: '#F5F7FA' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(val: any) => [`${Number(val).toLocaleString('uk-UA')} ₴`, 'Виручка']}
                                    />
                                    <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                                        {chartData.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={index < 3 ? '#3b82f6' : '#94a3b8'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Info Box */}
                <div className="bg-white rounded shadow-sm border border-gray-100">
                    <div className="p-4 border-b border-gray-100">
                        <h2 className="text-base font-semibold text-gray-700">Фінансові втрати</h2>
                    </div>
                    <div className="p-6 text-center flex flex-col justify-center h-[350px]">
                        <AlertTriangle size={48} className="mx-auto text-red-400 mb-4" />
                        <div className="text-sm font-medium text-gray-500 uppercase tracking-widest mb-2">Сума списань</div>
                        <div className="text-4xl font-bold text-gray-800 mb-2">
                            {(network.waste_uah || 0).toLocaleString('uk-UA')} <span className="text-2xl text-gray-500 font-normal">₴</span>
                        </div>
                        <p className="text-sm text-gray-500 max-w-xs mx-auto mt-4">
                            Це вартість викинутої або списаної продукції за вибраний період. Зменшення цієї цифри прямо впливає на чистий прибуток.
                        </p>
                    </div>
                </div>

            </div>

            {/* Time Series Row */}
            <div className="mt-6 bg-white rounded shadow-sm border border-gray-100">
                <div className="p-4 border-b border-gray-100">
                    <h2 className="text-base font-semibold text-gray-700">Динаміка мережі (Продажі vs Списання)</h2>
                </div>
                <div className="p-4">
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={network.trend_current || []} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEEEEE" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#9E9E9E', fontSize: 11 }}
                                    tickFormatter={(val) => {
                                        const d = new Date(val);
                                        return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                                    }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#9E9E9E', fontSize: 12 }}
                                />
                                <Tooltip
                                    cursor={{ fill: '#F5F7FA' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    labelFormatter={(val) => new Date(val).toLocaleDateString('uk-UA')}
                                />
                                <Bar dataKey="total_sold" name="Продано (шт)" fill="#10b981" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="total_waste" name="Списано (шт)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
