import React from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import type { SparkPoint } from '@/app/api/foodcost/route';
import { fmt, delta } from './utils';

export function Spark({ data, dataKey, color }: { data: SparkPoint[]; dataKey: keyof SparkPoint; color: string }) {
    return (
        <ResponsiveContainer width={80} height={32}>
            <LineChart data={data}>
                <Line
                    type="monotone"
                    dataKey={dataKey as string}
                    stroke={color}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                />
                <Tooltip
                    contentStyle={{ fontSize: 11, padding: '2px 6px', borderRadius: 4 }}
                    formatter={(v: any) => [fmt(Number(v)), '']}
                    labelFormatter={() => ''}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}

export function KpiCard({
    label,
    value,
    deltaVal,
    deltaUnit,
    invertDelta,
    spark,
    dataKey,
}: {
    label: string;
    value: string;
    deltaVal: number;
    deltaUnit?: string;
    invertDelta?: boolean;
    spark: SparkPoint[];
    dataKey: keyof SparkPoint;
}) {
    const d = delta(deltaVal, deltaUnit ?? '%', invertDelta);
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between">
                <span className="text-xs text-slate-500 font-medium">{label}</span>
                <Spark data={spark} dataKey={dataKey} color={d ? (d.positive ? '#22c55e' : '#ef4444') : '#94a3b8'} />
            </div>
            <div className="text-[22px] font-bold text-slate-900 leading-tight">{value}</div>
            {d && (
                <span className={`text-xs font-semibold ${d.positive ? 'text-green-600' : 'text-red-500'}`}>
                    {d.label} до мин. периоду
                </span>
            )}
        </div>
    );
}
