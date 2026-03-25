import dynamic from 'next/dynamic';

const FinancialDashboard = dynamic(
    () => import('@/components/analytics/FinancialDashboard').then((m) => m.FinancialDashboard),
    { ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-400">Завантаження...</div> }
);

export default function FinancePage() {
    return <FinancialDashboard />;
}
