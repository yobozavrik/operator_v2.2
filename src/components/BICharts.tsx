'use client';

import React from 'react';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';

const POWER_BI_COLORS = ['#58A6FF', '#F6C343', '#E5534B', '#3FB950', '#8B949E'];

interface ChartDataItem {
    name: string;
    value: number;
}

interface ChartProps {
    label: string;
    data: ChartDataItem[];
}

export const BILineChart = ({ label, data }: ChartProps) => {
    return (
        <div className="bg-[#0F1622] p-6 rounded-xl border border-[#1F2630] flex flex-col h-full">
            <div className="text-[10px] font-bold text-[#8B949E] uppercase tracking-widest mb-6">{label}</div>
            <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1F2630" vertical={false} />
                        <XAxis
                            dataKey="name"
                            stroke="#8B949E"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            dy={10}
                        />
                        <YAxis
                            stroke="#8B949E"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            dx={-10}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#0D1117', border: '1px solid #1F2630', fontSize: '11px', borderRadius: '8px', color: '#E6EDF3' }}
                            itemStyle={{ color: '#58A6FF' }}
                        />
                        <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#58A6FF"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: '#58A6FF', strokeWidth: 2, stroke: '#0F1622' }}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export const BIBarChart = ({ label, data }: ChartProps) => {
    return (
        <div className="bg-[#0F1622] p-6 rounded-xl border border-[#1F2630] flex flex-col h-full">
            <div className="text-[10px] font-bold text-[#8B949E] uppercase tracking-widest mb-6">{label}</div>
            <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#1F2630" horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis
                            dataKey="name"
                            type="category"
                            stroke="#E6EDF3"
                            fontSize={10}
                            width={80}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#0D1117', border: '1px solid #1F2630', fontSize: '11px', borderRadius: '8px', color: '#E6EDF3' }}
                        />
                        <Bar dataKey="value" fill="#58A6FF" radius={[0, 4, 4, 0]} barSize={24} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export const BIPieChart = ({ label, data }: ChartProps) => {
    return (
        <div className="bg-[#0F1622] p-6 rounded-xl border border-[#1F2630] flex flex-col h-full">
            <div className="text-[10px] font-bold text-[#8B949E] uppercase tracking-widest mb-6">{label}</div>
            <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            innerRadius={45}
                            outerRadius={65}
                            paddingAngle={8}
                            dataKey="value"
                            stroke="none"
                        >
                            {data.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={POWER_BI_COLORS[index % POWER_BI_COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{ backgroundColor: '#0D1117', border: '1px solid #1F2630', fontSize: '11px', borderRadius: '8px', color: '#E6EDF3' }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
