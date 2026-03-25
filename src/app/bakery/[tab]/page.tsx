import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';

const VALID_TABS = new Set(['summary', 'ranking', 'catalog', 'scout', 'oos', 'forecast', 'order']);

const CraftBreadAnalytics = dynamic(
    () => import('@/components/analytics/CraftBreadAnalytics').then((m) => m.CraftBreadAnalytics),
    { ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-400">Завантаження...</div> }
);

export default function BakeryTabPage({ params }: { params: { tab: string } }) {
  if (!VALID_TABS.has(params.tab)) {
    notFound();
  }
  return <CraftBreadAnalytics />;
}
