import DashboardOverview from '@/components/dashboard/DashboardOverview';
import {
  getGravitonMetrics,
  getPizzaSummary,
  getKonditerkaSummary,
  getBulvarSummary,
  getSadovaMetrics
} from '@/lib/dashboard-data';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // Fetch initial data in parallel on the server
  const [graviton, pizza, konditerka, bulvar, sadova] = await Promise.all([
    getGravitonMetrics(),
    getPizzaSummary(),
    getKonditerkaSummary(),
    getBulvarSummary(),
    getSadovaMetrics(),
  ]);

  const initialData = {
    graviton,
    pizza,
    konditerka,
    bulvar,
    sadova,
  };

  return <DashboardOverview initialData={initialData} />;
}
