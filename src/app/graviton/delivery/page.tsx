'use client';

import React from 'react';
import { GravitonDistributionPanel } from '@/components/graviton/GravitonDistributionPanel';
import { BackToHome } from '@/components/BackToHome';
import { BarChart2 } from 'lucide-react';

export default function GravitonDeliveryPage() {
    const [formattedDate, setFormattedDate] = React.useState<string>('');

    React.useEffect(() => {
        const currentTime = new Date();
        setFormattedDate(new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(currentTime));
    }, []);

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900">
            <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-4 py-4 md:px-6 md:py-6">
                <header className="mb-4 shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-col gap-2">
                            <BackToHome href="/graviton" label="Назад до Гравітону" />
                            <div className="flex items-center gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-700">
                                    <BarChart2 size={24} />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold uppercase tracking-wide text-slate-900">Гравітон</h1>
                                    <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">Розподіл · Логістика</p>
                                </div>
                            </div>
                        </div>

                        <div className="text-right text-sm font-medium capitalize text-slate-500">
                            {formattedDate}
                        </div>
                    </div>
                </header>

                <main className="min-h-0 flex-1">
                    <GravitonDistributionPanel />
                </main>
            </div>
        </div>
    );
}
