'use client';

import dynamic from 'next/dynamic';

const CraftBreadAnalytics = dynamic(
    () => import('@/components/analytics/CraftBreadAnalytics').then((m) => m.CraftBreadAnalytics),
    { ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-400">Завантаження...</div> }
);

export default function BakeryTabPage() {
  return <CraftBreadAnalytics />;
}
