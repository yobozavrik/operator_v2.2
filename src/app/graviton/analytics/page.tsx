'use client';

import dynamic from 'next/dynamic';

const GravitonProductionPlanner = dynamic(
    () => import('@/components/graviton/GravitonProductionPlanner').then((m) => m.GravitonProductionPlanner),
    { ssr: false, loading: () => <div className="flex h-full items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">Завантаження аналітики…</div> }
);

export default function GravitonAnalyticsPage() {
    return <GravitonProductionPlanner />;
}
