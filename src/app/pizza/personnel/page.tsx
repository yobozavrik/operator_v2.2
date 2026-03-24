'use client';

import React from 'react';
import { DashboardLayout } from '@/components/layout';
import { Users } from 'lucide-react';

export default function PizzaPersonnelPage() {
    return (
        <DashboardLayout fullHeight>
            <div className="flex flex-col items-center justify-center h-full text-white">
                <div className="bg-[#141829]/50 p-8 rounded-2xl border border-white/5 flex flex-col items-center">
                    <div className="w-16 h-16 rounded-xl bg-[#00D4FF]/10 flex items-center justify-center mb-6">
                        <Users size={32} className="text-[#00D4FF]" />
                    </div>
                    <h1 className="text-2xl font-bold uppercase tracking-wide mb-2 text-[#00D4FF]">
                        Персонал
                    </h1>
                    <p className="text-white/40 font-mono text-sm">
                        Сторінка в розробці...
                    </p>
                </div>
            </div>
        </DashboardLayout>
    );
}
