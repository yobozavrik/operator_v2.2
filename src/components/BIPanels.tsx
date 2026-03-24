'use client';

import React from 'react';
import { ArrowUpRight, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GaugeProps {
    value: number;
    max: number;
}

export const BIGauge = ({ value, max }: GaugeProps) => {
    const percentage = Math.min((value / max) * 100, 100);
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const strokeDasharray = percentage === 0 ? 0 : (percentage / 100) * circumference;

    return (
        <div className="bg-[#0F1622] p-6 rounded-xl border border-[#1F2630] flex flex-col items-center justify-center relative overflow-hidden h-full">
            <div className="text-[10px] font-bold text-[#8B949E] uppercase tracking-widest mb-6 w-full text-left">Production Capacity</div>
            <div className="relative w-32 h-32">
                <svg className="w-full h-full -rotate-90">
                    <circle
                        cx="64" cy="64" r={radius}
                        fill="transparent"
                        stroke="#161B22"
                        strokeWidth="10"
                    />
                    <circle
                        cx="64" cy="64" r={radius}
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth="10"
                        strokeDasharray={`${strokeDasharray} ${circumference}`}
                        strokeLinecap="round"
                        className={cn(
                            "transition-all duration-1000",
                            percentage > 85 ? "text-[#E5534B]" : percentage > 60 ? "text-[#F6C343]" : "text-[#58A6FF]"
                        )}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-[#E6EDF3] leading-none">{Math.round(value)}</span>
                    <span className="text-[9px] font-bold text-[#8B949E] uppercase mt-1">/{max} kg</span>
                </div>
            </div>
            <div className="mt-6 w-full flex justify-between items-center bg-[#0E1117] p-2 rounded-lg border border-[#1F2630]">
                <div className="flex items-center gap-1.5 px-1">
                    <div className={cn(
                        "w-2 h-2 rounded-full",
                        percentage > 85 ? "bg-[#E5534B]" : percentage > 60 ? "bg-[#F6C343]" : "bg-[#58A6FF]"
                    )} />
                    <span className="text-[9px] text-[#8B949E] font-bold uppercase">Status</span>
                </div>
                <span className="text-[11px] font-black text-[#E6EDF3] pr-1">{percentage.toFixed(0)}%</span>
            </div>
        </div>
    );
};

interface StatCardProps {
    label: string;
    value: string;
    subValue?: string;
    icon: LucideIcon;
    colorClass?: string;
}

export const BIStatCard = ({ label, value, subValue, icon: Icon, colorClass }: StatCardProps) => (
    <div className="bg-[#0F1622] p-6 rounded-xl border border-[#1F2630] flex flex-col h-full hover:bg-white/[0.01] transition-colors group">
        <div className="flex justify-between items-start mb-6">
            <div className="text-[10px] font-bold text-[#8B949E] uppercase tracking-widest">{label}</div>
            <div className="p-2 bg-[#0E1117] rounded-lg border border-[#1F2630]">
                <Icon size={16} className={colorClass || "text-[#8B949E]"} />
            </div>
        </div>
        <div className="flex-1 flex flex-col justify-end">
            <div className={cn("text-2xl font-black text-[#E6EDF3] leading-none mb-2", colorClass)}>{value}</div>
            <div className="text-[10px] font-bold text-[#8B949E] flex items-center gap-1.5 uppercase">
                {subValue && (
                    <>
                        <div className="flex items-center justify-center w-4 h-4 rounded-full bg-[#3FB950]/10">
                            <ArrowUpRight size={10} className="text-[#3FB950] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </div>
                        {subValue}
                    </>
                )}
            </div>
        </div>
    </div>
);
