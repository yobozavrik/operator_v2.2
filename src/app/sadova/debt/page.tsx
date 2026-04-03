'use client';

import dynamic from 'next/dynamic';

const SadovaDebtView = dynamic(
    () => import('@/components/sadova/SadovaDebtView').then((m) => m.SadovaDebtView),
    { ssr: false, loading: () => <div className="flex h-full items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">Завантаження боргу…</div> }
);

export default function SadovaDebtPage() {
    return <SadovaDebtView />;
}
