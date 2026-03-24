'use client';

import React from 'react';
import { DashboardLayout } from '@/components/layout';
import { TrendingUp, BarChart3, Clock } from 'lucide-react';

export default function PizzaAnalyticsPage() {
    return (
        <DashboardLayout fullHeight={true}>
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
                <div className="w-24 h-24 rounded-3xl bg-[#00D4FF]/10 flex items-center justify-center mb-8 border border-[#00D4FF]/20 shadow-[0_0_50px_rgba(0,212,255,0.1)]">
                    <TrendingUp size={48} className="text-[#00D4FF]" />
                </div>

                <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">
                    Модуль Аналітики
                </h1>

                <p className="text-xl text-white/40 font-medium max-w-lg mx-auto leading-relaxed mb-12">
                    Ми працюємо над створенням потужного інструменту для аналізу ефективності виробництва.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl">
                    <div className="bg-[#141829]/50 border border-white/5 rounded-2xl p-6 flex flex-col items-center gap-4">
                        <BarChart3 className="text-[#FFB800]" size={32} />
                        <span className="text-xs font-bold uppercase tracking-widest text-white/60">Звіти</span>
                    </div>
                    <div className="bg-[#141829]/50 border border-white/5 rounded-2xl p-6 flex flex-col items-center gap-4">
                        <TrendingUp className="text-emerald-400" size={32} />
                        <span className="text-xs font-bold uppercase tracking-widest text-white/60">Тренді</span>
                    </div>
                    <div className="bg-[#141829]/50 border border-white/5 rounded-2xl p-6 flex flex-col items-center gap-4">
                        <Clock className="text-[#00D4FF]" size={32} />
                        <span className="text-xs font-bold uppercase tracking-widest text-white/60">Швидко</span>
                    </div>
                </div>

                <div className="mt-16 inline-flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10">
                    <div className="w-2 h-2 rounded-full bg-[#FFB800] animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Статус: В розробці</span>
                </div>
            </div>
        </DashboardLayout>
    );
}
