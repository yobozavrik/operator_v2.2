'use client';

import React, { useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { CraftBreadSales } from '@/components/analytics/CraftBreadSales';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  LayoutDashboard,
  Loader2,
  Package,
  Percent,
  TrendingUp,
  ChevronRight,
  Filter,
  FileSpreadsheet,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type TabId = 'summary' | 'ranking' | 'catalog' | 'trend' | 'discount' | 'scout' | 'oos' | 'forecast' | 'sales' | 'order';

type ForecastCell = { predicted_qty: number; oos_prob: number; actual_qty: number | null; actual_oos: boolean | null };
type OrderSkuRow  = { sku_id: number; sku_name: string; forecast_total: number; oos_stores: number; adjusted_total: number; order_qty: number; surplus: number };
type DistCell     = { base_qty: number; oos_bonus: number; surplus_bonus: number; final_qty: number; oos_prob: number };
type ForecastPayload = {
  date: string;
  stores: { id: number; name: string }[];
  skus:   { id: number; name: string }[];
  pivot:  Record<string, Record<string, ForecastCell>>;
  meta:   { model_version: string; wape_cv: number } | null;
  order:  { production: OrderSkuRow[]; distribution: Record<string, Record<string, DistCell>> } | null;
};

type OosPayload = {
  date: string;
  nextSnapshotDate: string;
  periodLabel: string;
  breads: string[];
  stores: { storeId: number; storeName: string }[];
  rows: OosRow[];
  breadTotals: Record<string, number>;
  totalOos: number;
  source: 'balance_snapshots' | 'daily_oos' | 'empty';
};

type OosRow = {
  storeId: number;
  storeName: string;
  balances: Record<string, number>;
  totalOos: number;
};

type NetworkStats = {
  revenue_total?: number;
  revenue_fresh?: number;
  revenue_disc?: number;
  sell_through_rate?: number;
  qty_delivered?: number;
  waste_rate?: number;
  qty_waste?: number;
  cannibalization_pct?: number;
  cannibalization_rate?: number;
};

type StoreStats = {
  store_name?: string;
  fresh_sold?: number;
  disc_sold?: number;
  total_sold?: number;
  total_waste?: number;
  waste_uah?: number;
  cannibalization_pct?: number;
  cannibalization_rate?: number;
};

type CatalogPayload = {
  cards?: CatalogCard[];
};

type ScoutSummary = {
  promo_count: number;
  new_sku_count: number;
  avg_discount: number;
  top_active_competitor: string;
  price_changes_count: number;
};

type ScoutEvent = {
  id: string;
  event_type: string;
  sku_name: string;
  category: string;
  promo_type?: string;
  old_price?: number;
  new_price?: number;
  discount_pct?: number;
  confidence: number;
  summary_uk: string;
  event_date: string;
  severity: 'low' | 'medium' | 'high';
  competitor: { name: string };
  tags: Array<{ tag: string }>;
};

type ScoutCompetitor = {
  id: string;
  name: string;
  city: string;
  segment: string;
  priority: string;
};

type ScoutRecommendation = {
  id: string;
  date: string;
  text_uk: string;
  rationale: string;
  priority: 'low' | 'medium' | 'high';
  status: string;
};
type RankingPayload = {
  all_stores?: StoreStats[];
  top5_best?: StoreStats[];
  top5_worst?: StoreStats[];
  abc_categories?: Array<{
    sku_id?: number | string;
    sku_name?: string;
    total_sold?: number;
    total_revenue?: number;
    category?: string;
  }>;
};

type TrendRow = {
  store_name?: string;
  sku_name?: string;
  sold_14d?: number;
  trend_index?: number;
};

type AnalyticsPayload = {
  network?: NetworkStats;
  ranking?: RankingPayload;
  trends?: TrendRow[];
};

type CatalogCard = {
  sku_id?: number | string;
  sku_name?: string;
  total_sold?: number;
  total_revenue?: number;
  waste_pct?: number;
};

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const parsed = Number(v.replace(',', '.').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function fmt(v: unknown, digits = 0) {
  return new Intl.NumberFormat('uk-UA', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(num(v));
}

function fmtMoney(v: unknown) {
  return `${fmt(v, 0)} грн`;
}

function fmtPct(v: unknown) {
  return `${fmt(v, 1)}%`;
}

export const CraftBreadAnalytics = () => {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const activeTab = (params?.tab as TabId) || 'summary';
  const metricMode = (searchParams?.get('mode') as 'qty' | 'revenue') || 'qty';

  const startDate = searchParams?.get('start_date') || (() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  })();

  const endDate = searchParams?.get('end_date') || (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  })();

  const setUpdateParams = (updates: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams?.toString());
    Object.entries(updates).forEach(([k, v]) => newParams.set(k, v));
    router.push(`/bakery/${activeTab}?${newParams.toString()}`, { scroll: false });
  };

  const periodQuery = `start_date=${startDate}&end_date=${endDate}`;
  const analyticsQuery = activeTab === 'sales' ? null : `/api/bakery/analytics?${periodQuery}`;
  const { data: analytics, isLoading } = useSWR<AnalyticsPayload>(analyticsQuery, fetcher);

  // OOS: окрема дата (один день)
  const oosDate = searchParams?.get('oos_date') || (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  })();
  const { data: oosData, isLoading: oosLoading } = useSWR<OosPayload>(
    activeTab === 'oos' ? `/api/bakery/oos-balance?date=${oosDate}` : null,
    fetcher
  );

  // Forecast / Order: дата прогнозу
  const forecastDate = searchParams?.get('forecast_date') || (() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  })();
  const { data: forecastData, isLoading: forecastLoading } = useSWR<ForecastPayload>(
    (activeTab === 'forecast' || activeTab === 'order') ? `/api/bakery/forecasts?date=${forecastDate}` : null,
    fetcher
  );

  const network = analytics?.network ?? {};
  const ranking = analytics?.ranking ?? {};

  const allStores = useMemo(() => ranking.all_stores ?? [], [ranking.all_stores]);
  const topStores = ranking.top5_best ?? [];
  const weakStores = ranking.top5_worst ?? [];
  const abc = ranking.abc_categories ?? [];

  const cards = [
    {
      title: 'Загальна виручка',
      value: fmtMoney(network.revenue_total ?? num(network.revenue_fresh) + num(network.revenue_disc)),
      noteLeft: `Фреш: ${fmt(network.revenue_fresh)}`,
      noteRight: `Реалізація: ${fmtPct(network.sell_through_rate)}`,
      tone: 'blue',
      icon: TrendingUp,
    },
    {
      title: 'Індекс реалізації',
      value: fmtPct(network.sell_through_rate),
      noteLeft: `Привезено: ${fmt(network.qty_delivered)} шт`,
      noteRight: 'Норма > 85%',
      tone: 'green',
      icon: Activity,
    },
    {
      title: 'Рівень списання',
      value: fmtPct(network.waste_rate),
      noteLeft: `К-сть: ${fmt(network.qty_waste)} шт`,
      noteRight: num(network.waste_rate) > 15 ? 'Критично' : 'Оптимально',
      tone: num(network.waste_rate) > 15 ? 'red' : 'amber',
      icon: ArrowDownRight,
    },
    {
      title: 'Каннібалізація акцій',
      value: fmtPct(network.cannibalization_pct ?? network.cannibalization_rate),
      noteLeft: 'Поріг: 25%',
      noteRight: 'Норма',
      tone: 'amber',
      icon: Percent,
    },
  ] as const;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc,_#eef4ff_45%,_#f8fafc)] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden">
      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-8 md:py-8 space-y-6">
        
        {/* Header Section */}
        <header className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur-md md:p-8 relative overflow-hidden ring-1 ring-white/20">
          <div className="absolute top-0 right-0 -m-8 h-48 w-48 rounded-full bg-blue-50/50 blur-3xl" />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between relative z-10">
            <div className="space-y-4">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 hover:text-blue-600 transition-all group font-[family-name:var(--font-jetbrains)]"
              >
                <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-slate-50 group-hover:bg-blue-50 transition-colors">
                    <ArrowLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" />
                </div>
                Повернутися назад
              </Link>
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 md:text-5xl uppercase font-[family-name:var(--font-chakra)]">
                  Пекарня <span className="text-blue-600">Analytics</span>
                </h1>
                <p className="mt-2 text-slate-500 font-medium max-w-2xl text-sm md:text-base leading-relaxed">
                  Смарт-дашборд операційної эффективності мережі пекарень. Збір даних у режимі Real-time та 
                  ABC-аналіз асортименту.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/50 px-5 py-3 shadow-sm hover:border-slate-300 transition-colors">
                <Calendar size={16} className="text-blue-600" />
                <div className="flex items-center gap-3 font-mono text-sm font-bold text-slate-700 font-[family-name:var(--font-jetbrains)]">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setUpdateParams({ start_date: e.target.value })}
                    className="bg-transparent outline-none cursor-pointer focus:text-blue-600 transition-colors"
                  />
                  <span className="text-slate-300">—</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setUpdateParams({ end_date: e.target.value })}
                    className="bg-transparent outline-none cursor-pointer focus:text-blue-600 transition-colors"
                  />
                </div>
              </div>
              <Link
                href={`/bakery/sales?${searchParams.toString()}`}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-[10px] font-black uppercase tracking-[0.22em] text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <FileSpreadsheet size={14} />
                Продажі
              </Link>
            </div>
          </div>
        </header>

        {/* Intelligent Tab System */}
        <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/40 p-1.5 shadow-sm backdrop-blur-md">
          {[
            { id: 'summary', label: 'Моніторинг мережі', icon: LayoutDashboard },
            { id: 'ranking', label: 'Аналітика та ABC', icon: TrendingUp },
            { id: 'catalog', label: 'Каталог SKU', icon: Package },
            { id: 'scout', label: 'Розвідник', icon: Filter },
            { id: 'oos', label: 'OOS Карта', icon: AlertTriangle },
            { id: 'forecast', label: 'Прогноз', icon: TrendingUp },
            { id: 'sales', label: 'Продажі', icon: FileSpreadsheet },
            { id: 'order', label: 'Замовлення', icon: Package },
          ].map((tab) => (
            <Link
              key={tab.id}
              href={`/bakery/${tab.id}?${searchParams.toString()}`}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all font-[family-name:var(--font-chakra)]",
                activeTab === tab.id 
                  ? "bg-slate-900 text-white shadow-lg shadow-slate-200 ring-1 ring-slate-900" 
                  : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              )}
            >
              <tab.icon size={14} strokeWidth={activeTab === tab.id ? 3 : 2} />
              {tab.label}
            </Link>
          ))}
        </nav>

        {/* Content Area Rendering */}
        <main className="min-h-[500px]">
          
          {activeTab === 'scout' && (
            <ScoutDashboard period={{ from: startDate, to: endDate }} />
          )}

          {activeTab === 'oos' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-700 ease-out">
              {/* OOS date picker */}
              <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-md">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <Calendar size={14} className="text-rose-500" />
                  Знімок залишків на кінець дня
                </div>
                <input
                  type="date"
                  value={oosDate}
                  onChange={(e) => setUpdateParams({ oos_date: e.target.value })}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition-all font-[family-name:var(--font-jetbrains)]"
                />
              {oosData && (
                  <div className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 border border-rose-100">
                    <AlertTriangle size={14} className="text-rose-500" />
                    <span className="text-[11px] font-black text-rose-600 uppercase tracking-widest">
                      {oosData.totalOos} OOS подій · snapshot {oosData.nextSnapshotDate}
                    </span>
                  </div>
                )}
              </div>

              {oosLoading && (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="animate-spin text-slate-300" size={32} />
                </div>
              )}

              {!oosLoading && oosData && oosData.rows.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-slate-300">
                  <Package size={48} className="mb-4" />
                  <p className="font-bold text-lg">Знімків за цю дату ще немає</p>
                  <p className="text-sm mt-2">Для закриття дня використовується ранковий snapshot наступного дня</p>
                </div>
              )}

              {!oosLoading && oosData && oosData.rows.length > 0 && (
                <OosPivotTable data={oosData} />
              )}
            </div>
          )}

          {activeTab === 'forecast' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-700 ease-out">
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-md">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <TrendingUp size={14} className="text-indigo-500" />
                  Прогноз попиту LightGBM
                </div>
                <input
                  type="date"
                  value={forecastDate}
                  onChange={(e) => setUpdateParams({ forecast_date: e.target.value })}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-[family-name:var(--font-jetbrains)]"
                />
                {forecastData?.meta && (
                  <div className="ml-auto flex items-center gap-3">
                    <span className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                      {forecastData.meta.model_version}
                    </span>
                    <span className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      WAPE {(forecastData.meta.wape_cv * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
              {forecastLoading && (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="animate-spin text-slate-300" size={32} />
                </div>
              )}
              {!forecastLoading && forecastData && forecastData.skus.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-slate-300">
                  <TrendingUp size={48} className="mb-4" />
                  <p className="font-bold text-lg">Прогнозів на цю дату ще немає</p>
                  <p className="text-sm mt-2">Запустіть: python bakery1/predict_demand.py {forecastDate}</p>
                </div>
              )}
              {!forecastLoading && forecastData && forecastData.skus.length > 0 && (
                <ForecastPivotTable data={forecastData} />
              )}
            </div>
          )}

          {activeTab === 'sales' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-700 ease-out">
              <CraftBreadSales embedded />
            </div>
          )}

          {activeTab === 'order' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-700 ease-out">
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-md">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <Package size={14} className="text-blue-500" />
                  Замовлення на виробництво
                </div>
                <input
                  type="date"
                  value={forecastDate}
                  onChange={(e) => setUpdateParams({ forecast_date: e.target.value })}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all font-[family-name:var(--font-jetbrains)]"
                />
                {forecastData?.meta && (
                  <div className="ml-auto flex items-center gap-3">
                    <span className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                      {forecastData.meta.model_version}
                    </span>
                    <span className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      WAPE {(forecastData.meta.wape_cv * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
              {forecastLoading && (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="animate-spin text-slate-300" size={32} />
                </div>
              )}
              {!forecastLoading && forecastData && !forecastData.order && (
                <div className="flex flex-col items-center justify-center py-24 text-slate-300">
                  <Package size={48} className="mb-4" />
                  <p className="font-bold text-lg">Прогнозів на цю дату ще немає</p>
                  <p className="text-sm mt-2">Запустіть: python bakery1/predict_demand.py {forecastDate}</p>
                </div>
              )}
              {!forecastLoading && forecastData?.order && (
                <OrderView data={forecastData} />
              )}
            </div>
          )}

          {activeTab === 'summary' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-700 ease-out">
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                 {cards.map((c, i) => (
                    <article key={i} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-100 flex flex-col justify-between">
                       <div className="flex items-center justify-between mb-4">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{c.title}</span>
                          <div className={cn("p-2 rounded-xl", 
                             c.tone === 'blue' ? "bg-blue-50 text-blue-600" : 
                             c.tone === 'green' ? "bg-emerald-50 text-emerald-600" : 
                             c.tone === 'red' ? "bg-rose-50 text-rose-500" : "bg-amber-50 text-amber-600")}>
                             <c.icon size={16} />
                          </div>
                       </div>
                       <div>
                          <div className="text-2xl font-black text-slate-900 font-mono tracking-tighter mb-4">{c.value}</div>
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                             <span>{c.noteLeft}</span>
                             <span className="text-slate-900">{c.noteRight}</span>
                          </div>
                       </div>
                    </article>
                 ))}
              </div>

              <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden ring-1 ring-slate-100">
                <div className="border-b border-slate-100 bg-slate-50/30 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-100">
                        <Package size={20} />
                     </div>
                     <div>
                        <h2 className="font-display font-bold text-slate-900 uppercase tracking-widest font-[family-name:var(--font-chakra)] text-lg">
                            Зведені показники по локаціях
                        </h2>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Оновлено: щойно</span>
                     </div>
                  </div>
                  <div className="flex rounded-xl border border-slate-200 bg-white p-1 ring-1 ring-slate-100">
                    <button 
                      onClick={() => setUpdateParams({ mode: 'qty' })}
                      className={cn("rounded-lg px-5 py-2 text-[10px] font-black uppercase tracking-widest transition-all", metricMode === 'qty' ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-600")}
                    >К-сть</button>
                    <button 
                      onClick={() => setUpdateParams({ mode: 'revenue' })}
                      className={cn("rounded-lg px-5 py-2 text-[10px] font-black uppercase tracking-widest transition-all", metricMode === 'revenue' ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-600")}
                    >Маржа</button>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-50 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        <th className="px-6 py-5 text-left">Філія / Магазин</th>
                        <th className="px-6 py-5 text-right">Фреш (Продажі)</th>
                        <th className="px-6 py-5 text-right">Акції / Знижки</th>
                        <th className="px-6 py-5 text-right">Списання</th>
                        <th className="px-6 py-5 text-right">Загальний оборот</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {allStores.map((s, i) => {
                        const isQty = metricMode === 'qty';
                        const fresh = isQty ? num(s.fresh_sold) : num((s as any).revenue_fresh);
                        const disc = isQty ? num(s.disc_sold) : num((s as any).revenue_disc);
                        const waste = isQty ? num(s.total_waste) : num(s.waste_uah);
                        const total = isQty ? fresh + disc : fresh + disc; // Simplification
                        const unit = isQty ? 'шт' : 'грн';
                        return (
                          <tr key={i} className="group hover:bg-slate-50/80 transition-all border-l-4 border-l-transparent hover:border-l-blue-600">
                            <td className="px-6 py-5 font-bold text-slate-800 text-base">{s.store_name}</td>
                            <td className="px-6 py-5 text-right font-mono font-bold text-blue-600/80">{fmt(fresh)} {unit}</td>
                            <td className="px-6 py-5 text-right font-mono font-bold text-emerald-600/80">{fmt(disc)} {unit}</td>
                            <td className="px-6 py-5 text-right font-mono font-bold text-rose-400">{fmt(waste)} {unit}</td>
                            <td className="px-6 py-5 text-right font-mono font-black text-slate-900 text-base">{fmt(total)} {unit}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm ring-1 ring-slate-100 flex flex-col items-center">
                  <div className="w-full mb-6 flex items-center justify-between">
                     <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-emerald-600">Ефективні точки</h3>
                     <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600"><TrendingUp size={16} /></div>
                  </div>
                  <div className="w-full space-y-2.5">
                    {topStores.map((s, i) => (
                      <div key={i} className="flex items-center justify-between rounded-2xl bg-slate-50/50 p-4 border border-transparent hover:border-emerald-100 hover:bg-emerald-50/30 transition-all group">
                        <span className="font-bold text-slate-900">{s.store_name}</span>
                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <span className="font-mono font-black text-emerald-600 text-lg tabular-nums">{fmt(s.total_sold)}</span>
                                <span className="text-[10px] uppercase font-bold text-slate-400 ml-1">шт</span>
                            </div>
                            <ChevronRight size={14} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm ring-1 ring-slate-100 flex flex-col items-center">
                  <div className="w-full mb-6 flex items-center justify-between">
                     <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-rose-500">Ризикові зони</h3>
                     <div className="p-2 rounded-xl bg-rose-50 text-rose-500"><ArrowDownRight size={16} /></div>
                  </div>
                  <div className="w-full space-y-2.5">
                    {weakStores.map((s, i) => (
                      <div key={i} className="flex items-center justify-between rounded-2xl bg-slate-50/50 p-4 border border-transparent hover:border-rose-100 hover:bg-rose-50/30 transition-all group">
                        <span className="font-bold text-slate-900">{s.store_name}</span>
                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <span className="font-mono font-black text-rose-500 text-lg tabular-nums">{fmt(s.total_sold)}</span>
                                <span className="text-[10px] uppercase font-bold text-slate-400 ml-1">шт</span>
                            </div>
                            <ChevronRight size={14} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </div>
          )}

          {activeTab === 'ranking' && (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm animate-in fade-in zoom-in-95 duration-700 ease-out">
               <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
                     <TrendingUp size={24} />
                  </div>
                  <div>
                    <h2 className="font-display text-2xl font-bold text-slate-900 uppercase tracking-widest font-[family-name:var(--font-chakra)]">
                        Цінова аналітика та ABC-матриця
                    </h2>
                    <p className="text-slate-400 font-medium text-sm">Кластеризація асортименту на основі внеску в загальну виручку мережі.</p>
                  </div>
               </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                   {abc.map((item, i) => (
                     <article key={i} className="group rounded-2xl border border-slate-100 bg-slate-50/40 p-5 transition-all hover:bg-white hover:shadow-xl hover:border-blue-100 border-b-4 border-b-transparent hover:border-b-blue-600">
                        <div className="flex items-start justify-between mb-5">
                           <div>
                              <div className="font-black text-slate-900 text-xl tracking-tight leading-tight mb-1">{item.sku_name}</div>
                              <div className="text-[9px] font-black text-slate-400 uppercase font-mono tracking-widest">Article: {item.sku_id}</div>
                           </div>
                           <div className={cn(
                             "px-3 py-1.5 rounded-xl font-mono text-[10px] font-black shadow-sm ring-1 ring-inset",
                             item.category === 'A' ? "bg-blue-600 text-white ring-blue-700" : 
                             item.category === 'B' ? "bg-emerald-500 text-white ring-emerald-600" : "bg-slate-200 text-slate-600 ring-slate-300"
                           )}>
                              {item.category}-CLASS
                           </div>
                        </div>
                        <div className="grid grid-cols-2 gap-6 pt-5 mt-auto border-t border-slate-100/60">
                           <div className="space-y-1">
                              <div className="text-[9px] uppercase font-black text-slate-300 tracking-[0.2em]">Виручка</div>
                              <div className="font-bold text-slate-900 font-mono tracking-tighter tabular-nums">{fmtMoney(item.total_revenue)}</div>
                           </div>
                           <div className="text-right space-y-1">
                              <div className="text-[9px] uppercase font-black text-slate-300 tracking-[0.2em]">Об'єм</div>
                              <div className="font-black text-slate-900 font-mono text-xl tabular-nums">{fmt(item.total_sold)} <span className="text-[10px] text-slate-400 uppercase ml-0.5">шт</span></div>
                           </div>
                        </div>
                     </article>
                   ))}
                </div>
            </div>
          )}

          {activeTab === 'catalog' && (
            <div className="rounded-3xl border border-slate-200 bg-white p-20 shadow-sm text-center space-y-6 animate-in zoom-in-95 duration-700 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#f8fafc_100%)] opacity-40" />
                <div className="relative z-10 flex flex-col items-center">
                    <div className="mb-6 w-24 h-24 rounded-3xl bg-slate-50 flex items-center justify-center text-slate-300 shadow-inner">
                        <Package size={48} strokeWidth={1.5} />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 font-[family-name:var(--font-chakra)] uppercase tracking-[0.3em]">Каталог SKU</h3>
                    <p className="text-slate-400 max-w-sm mx-auto mt-3 font-medium text-sm leading-relaxed">
                        Модуль детальної специфікації товарів та управління асортиментною матрицею знаходиться в розробці.
                    </p>
                    <Link 
                      href={`/bakery/summary?${searchParams.toString()}`}
                      className="mt-10 px-8 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.25em] shadow-lg shadow-slate-200 hover:-translate-y-0.5 transition-all active:scale-95"
                    >Повернутися до зведення</Link>
                </div>
            </div>
          )}

        </main>
      </div>

      {isLoading && (
        <div className="fixed bottom-10 right-10 flex items-center gap-4 rounded-3xl border border-slate-200 bg-white/95 px-6 py-4 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-10 duration-500 ring-1 ring-white/50">
          <div className="relative">
             <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-20" />
             <Loader2 className="animate-spin text-blue-600 relative z-10" size={20} strokeWidth={3} />
          </div>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900 font-[family-name:var(--font-jetbrains)] animate-pulse">Syncing Data Layer...</div>
        </div>
      )}
    </div>
  );
};

// --- Scout Sub-components ---

const ScoutDashboard = ({ period }: { period: { from: string, to: string } }) => {
  const { data: summaryData, isLoading: loadingSummary } = useSWR<{ summary: ScoutSummary; source?: string; error?: string }>(
    `/api/bakery/scout/summary?from=${period.from}&to=${period.to}`,
    fetcher
  );
  const { data: eventsData, isLoading: loadingEvents } = useSWR<{ events: ScoutEvent[]; source?: string; error?: string }>(
    `/api/bakery/scout/events?from=${period.from}&to=${period.to}`,
    fetcher
  );
  const { data: recommendationsData } = useSWR<{ recommendations: ScoutRecommendation[]; source?: string; error?: string }>(
    `/api/bakery/scout/recommendations`,
    fetcher
  );

  const summary = summaryData?.summary;
  const events = eventsData?.events || [];
  const recs = recommendationsData?.recommendations || [];
  const source = eventsData?.source || summaryData?.source || recommendationsData?.source || 'unknown';
  const sourceError = eventsData?.error || summaryData?.error || recommendationsData?.error || '';

  if (loadingSummary || loadingEvents) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-xs font-semibold text-slate-600">
        Джерело даних: <span className="text-slate-900">{source}</span>
        {sourceError ? <span className="ml-3 text-rose-600">({sourceError})</span> : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <ScoutKPICard title="Акції" value={summary?.promo_count || 0} subtitle="Знайдено івентів" icon={TrendingUp} color="blue" />
        <ScoutKPICard title="Новинки" value={summary?.new_sku_count || 0} subtitle="Конкурентів" icon={Package} color="emerald" />
        <ScoutKPICard title="Знижка" value={fmtPct(summary?.avg_discount || 0)} subtitle="Середня по ринку" icon={Percent} color="amber" />
        <ScoutKPICard title="Лідер" value={summary?.top_active_competitor || '---'} subtitle="Найактивніший" icon={Activity} color="rose" />
        <ScoutKPICard title="Ціни" value={summary?.price_changes_count || 0} subtitle="Змін за період" icon={TrendingUp} color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-4">
           <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Стрічка подій розвідника</h3>
           <div className="space-y-3">
             {events.length > 0 ? events.map(event => (
               <ScoutEventCard key={event.id} event={event} />
             )) : (
               <div className="p-12 text-center text-slate-300 font-bold italic bg-white rounded-3xl border border-slate-100 italic">Подій за обраний період не знайдено</div>
             )}
           </div>
        </section>

        <section className="space-y-4">
           <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">AI-Рекомендації</h3>
           <div className="space-y-3">
             {recs.length > 0 ? recs.map(rec => (
                <div key={rec.id} className="p-5 rounded-3xl border border-blue-100 bg-blue-50/30 space-y-3">
                   <div className="flex items-center justify-between">
                      <span className={cn("px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest", rec.priority === 'high' ? "bg-rose-500 text-white" : "bg-blue-600 text-white")}>
                        {rec.priority} priority
                      </span>
                      <span className="text-[9px] font-mono text-slate-400">{new Date(rec.date).toLocaleDateString()}</span>
                   </div>
                   <p className="text-sm font-bold text-slate-900 leading-relaxed">{rec.text_uk}</p>
                   <div className="pt-3 border-t border-blue-100/50 text-[10px] text-blue-600 font-medium leading-relaxed italic">
                      Rationale: {rec.rationale}
                   </div>
                </div>
             )) : (
               <div className="p-8 text-center text-slate-300 font-bold bg-white rounded-3xl border border-slate-100">Рекомендації відсутні</div>
             )}
           </div>
        </section>
      </div>
    </div>
  );
};

const ScoutKPICard = ({ title, value, subtitle, icon: Icon, color }: any) => (
  <div className="p-5 rounded-3xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-50 transition-all hover:shadow-md">
     <div className="flex items-center justify-between mb-3">
        <div className={cn("p-2 rounded-xl", color === 'blue' ? "bg-blue-50 text-blue-600" : color === 'emerald' ? "bg-emerald-50 text-emerald-600" : color === 'amber' ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-500")}>
           <Icon size={14} />
        </div>
        <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{title}</div>
     </div>
     <div className="text-xl font-black text-slate-900 font-mono tracking-tighter">{value}</div>
     <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">{subtitle}</div>
  </div>
);

const OosPivotTable = ({ data }: { data: OosPayload }) => {
  const { breads, rows, breadTotals } = data;
  const normalizedRows = [...rows].sort((a, b) => b.totalOos - a.totalOos || a.storeName.localeCompare(b.storeName));
  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden ring-1 ring-slate-100">
      <div className="border-b border-slate-100 bg-slate-50/30 p-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center text-white shadow-lg shadow-rose-100">
          <AlertTriangle size={20} />
        </div>
        <div>
          <h2 className="font-display font-bold text-slate-900 uppercase tracking-widest font-[family-name:var(--font-chakra)] text-lg">
            OOS карта — кінець дня
          </h2>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
            🔴 OOS (0 шт) &nbsp;·&nbsp; 🟢 В наявності
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="sticky left-0 z-10 bg-slate-50/90 backdrop-blur px-5 py-4 text-left text-[9px] font-black uppercase tracking-widest text-slate-400 min-w-[140px]">
                Магазин
              </th>
              <th className="px-3 py-4 text-center text-[9px] font-black uppercase tracking-widest text-rose-400 min-w-[60px]">
                OOS
              </th>
              {breads.map((bread) => (
                <th key={bread} className="px-3 py-4 text-center min-w-[80px]">
                  <div className="text-[8px] font-black uppercase tracking-wide text-slate-500 leading-tight whitespace-nowrap">
                    {bread.replace('Хліб "', '').replace('"', '').replace('Багет ', '').replace('Батон', 'Батон')}
                  </div>
                  {(breadTotals[bread] ?? 0) > 0 && (
                    <div className="text-[8px] font-black text-rose-400 mt-0.5">{breadTotals[bread]} OOS</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {normalizedRows.map((store) => (
              <tr
                key={store.storeId}
                className={cn(
                  'group transition-all hover:bg-slate-50/80',
                  store.totalOos > 0 ? 'border-l-4 border-l-rose-400' : 'border-l-4 border-l-emerald-400'
                )}
              >
                <td className="sticky left-0 z-10 bg-white/90 group-hover:bg-slate-50/90 backdrop-blur px-5 py-3 font-bold text-slate-800 text-sm whitespace-nowrap">
                  {store.storeName}
                </td>
                <td className="px-3 py-3 text-center">
                  {store.totalOos > 0 ? (
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-rose-100 text-rose-600 font-black text-xs">
                      {store.totalOos}
                    </span>
                  ) : (
                    <CheckCircle2 size={16} className="text-emerald-400 mx-auto" />
                  )}
                </td>
                {breads.map((bread) => {
                  const qty = store.balances?.[bread];
                  const isOos = qty === 0;
                  const noData = qty === undefined;
                  return (
                    <td key={bread} className="px-3 py-3 text-center">
                      {noData ? (
                        <span className="text-slate-200 font-mono text-[10px]">—</span>
                      ) : isOos ? (
                        <span className="inline-flex items-center justify-center w-8 h-6 rounded-lg bg-rose-100 text-rose-600 font-black text-[10px]">
                          OOS
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center px-2 h-6 rounded-lg bg-emerald-50 text-emerald-700 font-black text-[10px] font-mono tabular-nums">
                          {qty}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ScoutEventCard = ({ event }: { event: ScoutEvent }) => (
  <div className="group p-5 rounded-3xl border border-slate-100 bg-white hover:border-blue-200 hover:shadow-lg transition-all relative overflow-hidden">
     <div className={cn("absolute top-0 left-0 w-1 h-full", event.severity === 'high' ? "bg-rose-500" : event.severity === 'medium' ? "bg-amber-500" : "bg-blue-500")} />
     <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
           <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-blue-600">{event.event_type}</span>
              <span className="text-slate-300">•</span>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{event.competitor.name}</span>
           </div>
           <h4 className="font-bold text-slate-900 text-base leading-tight">{event.sku_name} <span className="text-slate-400 font-medium text-xs">({event.category})</span></h4>
           {event.event_type === 'promo' && (
              <div className="flex items-center gap-3">
                 <div className="text-xs font-black text-rose-500 font-mono">-{event.discount_pct}%</div>
                 <div className="text-[10px] font-bold text-slate-400 line-through font-mono">{event.old_price} грн</div>
                 <div className="text-[10px] font-black text-slate-900 font-mono">{event.new_price} грн</div>
              </div>
           )}
           <p className="text-xs text-slate-500 font-medium leading-relaxed">{event.summary_uk}</p>
           <div className="flex flex-wrap gap-1.5 pt-2">
              {event.tags.map((t, idx) => (
                <span key={idx} className="px-2 py-0.5 rounded-lg bg-slate-50 text-slate-400 text-[8px] font-black uppercase tracking-widest">#{t.tag}</span>
              ))}
           </div>
        </div>
        <div className="text-right shrink-0">
           <div className="text-[10px] font-black text-slate-900 font-mono">{new Date(event.event_date).toLocaleDateString()}</div>
           <div className="mt-2 flex items-center gap-1 justify-end">
              <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Confidence</span>
              <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                 <div className="h-full bg-blue-600" style={{ width: `${event.confidence * 100}%` }} />
              </div>
           </div>
        </div>
     </div>
  </div>
);

const ForecastPivotTable = ({ data }: { data: ForecastPayload }) => {
  const { stores = [], skus = [], pivot = {} } = data;
  const p = pivot as Record<string, Record<string, ForecastCell>>;
  const getCell = (spotId: number, skuId: number) =>
    p[String(spotId)]?.[String(skuId)] ?? null;
  const hasActuals = stores.some(s => skus.some(k => getCell(s.id, k.id)?.actual_qty != null));

  const shortName = (name: string) =>
    name.replace('Хліб ', '').replace('Багет ', 'Баг. ').replace(/"/g, '').trim();

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse" style={{ minWidth: `${160 + skus.length * 72}px` }}>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-left font-black text-[10px] uppercase tracking-widest text-slate-400 w-40 min-w-[160px]">
                Магазин
              </th>
              {skus.map(sku => (
                <th key={sku.id} className="w-[68px] min-w-[68px] px-1 py-3 text-center font-black text-[9px] uppercase tracking-wide text-slate-400">
                  <span className="block" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 64, lineHeight: '1.2' }} title={sku.name}>
                    {shortName(sku.name)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stores.map(store => {
              const totalPred = skus.reduce((s, k) => s + (getCell(store.id, k.id)?.predicted_qty ?? 0), 0);
              const highOos   = skus.filter(k => (getCell(store.id, k.id)?.oos_prob ?? 0) >= 0.5).length;
              return (
                <tr key={store.id} className={cn(
                  'group transition-colors hover:bg-slate-50/60',
                  highOos > 0 ? 'border-l-4 border-l-amber-400' : 'border-l-4 border-l-transparent'
                )}>
                  <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-4 py-2.5 whitespace-nowrap w-40 min-w-[160px]">
                    <div className="font-bold text-slate-800 text-sm leading-tight">{store.name}</div>
                    <div className="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center gap-1.5">
                      <span>{totalPred} шт</span>
                      {highOos > 0 && <span className="text-amber-500 font-black">· {highOos} OOS↑</span>}
                    </div>
                  </td>
                  {skus.map(sku => {
                    const cell = getCell(store.id, sku.id);
                    if (!cell) return (
                      <td key={sku.id} className="w-[68px] px-1 py-2.5 text-center text-slate-200 text-xs">—</td>
                    );
                    const prob = cell.oos_prob ?? 0;
                    const bg = prob >= 0.7 ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
                             : prob >= 0.5 ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
                             : prob >= 0.3 ? 'bg-yellow-50 text-slate-600'
                             : 'bg-emerald-50 text-slate-700';
                    return (
                      <td key={sku.id} className="w-[68px] px-1 py-2.5 text-center">
                        <div className={cn('inline-flex flex-col items-center justify-center rounded-xl px-2 py-1.5 w-[54px]', bg)}>
                          <span className="font-black text-base leading-none">{cell.predicted_qty}</span>
                          <span className="text-[9px] font-bold opacity-70 mt-0.5">{Math.round(prob * 100)}%</span>
                          {hasActuals && cell.actual_qty != null && (
                            <span className="text-[9px] font-medium opacity-60 mt-0.5 border-t border-current/20 pt-0.5 w-full text-center">
                              ={cell.actual_qty}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-t border-slate-100 bg-slate-50/50">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">OOS ризик:</span>
        {[
          { label: '< 30%', cls: 'bg-emerald-50 text-slate-700' },
          { label: '30–50%', cls: 'bg-yellow-50 text-slate-600' },
          { label: '50–70%', cls: 'bg-amber-100 text-amber-700' },
          { label: '> 70%', cls: 'bg-rose-100 text-rose-700' },
        ].map(l => (
          <span key={l.label} className={cn('px-2.5 py-1 rounded-lg text-[10px] font-bold', l.cls)}>{l.label}</span>
        ))}
        <span className="text-[10px] text-slate-400 ml-1">число = прогноз шт · % = ймовірність OOS{hasActuals ? ' · =N = факт' : ''}</span>
      </div>
    </div>
  );
};

const OrderView = ({ data }: { data: ForecastPayload }) => {
  const { stores = [], skus = [], order } = data;
  if (!order) return null;
  const { production, distribution } = order;

  const dist = distribution as Record<string, Record<string, DistCell>>;
  const getDistCell = (spotId: number, skuId: number) =>
    dist[String(spotId)]?.[String(skuId)] ?? null;

  const totalOrder = production.reduce((s, r) => s + r.order_qty, 0);

  const shortName = (name: string) =>
    name.replace('Хліб ', '').replace('Багет ', 'Баг. ').replace(/"/g, '').trim();

  const prodSkuIds = new Set(production.map(r => r.sku_id));
  const prodSkus = skus.filter(k => prodSkuIds.has(k.id));

  return (
    <div className="space-y-6">
      {/* Production table */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div>
            <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500">Замовлення на виробництво</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">adjusted = прогноз + 1 якщо OOS &gt; 50% · замовлення кратне 10</p>
          </div>
          <div className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-black tabular-nums">
            Разом: {totalOrder} шт
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 bg-slate-50/30">
                <th className="px-5 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-right">Прогноз</th>
                <th className="px-4 py-3 text-right">+OOS</th>
                <th className="px-4 py-3 text-right">Скориговано</th>
                <th className="px-4 py-3 text-right">Замовлення</th>
                <th className="px-4 py-3 text-right">Надлишок</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {production.map(row => (
                <tr key={row.sku_id} className="group hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3 font-bold text-slate-800 text-sm">{row.sku_name}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-600 tabular-nums">{row.forecast_total}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                    {row.oos_stores > 0
                      ? <span className="text-amber-600">+{row.oos_stores}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 tabular-nums">{row.adjusted_total}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-block px-3 py-1 rounded-xl bg-blue-600 text-white font-black font-mono tabular-nums text-sm">
                      {row.order_qty}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-400 tabular-nums">{row.surplus}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="px-5 py-3 font-black text-[11px] uppercase tracking-widest text-slate-500">Разом</td>
                <td className="px-4 py-3 text-right font-mono font-black text-slate-700 tabular-nums">
                  {production.reduce((s, r) => s + r.forecast_total, 0)}
                </td>
                <td className="px-4 py-3 text-right font-mono font-black text-amber-600 tabular-nums">
                  +{production.reduce((s, r) => s + r.oos_stores, 0)}
                </td>
                <td className="px-4 py-3 text-right font-mono font-black text-slate-700 tabular-nums">
                  {production.reduce((s, r) => s + r.adjusted_total, 0)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-block px-3 py-1 rounded-xl bg-blue-700 text-white font-black font-mono tabular-nums text-sm">
                    {totalOrder}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono font-black text-slate-400 tabular-nums">
                  {production.reduce((s, r) => s + r.surplus, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Distribution pivot */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500">Розподіл по магазинах</h2>
          <p className="text-[10px] text-slate-400 mt-0.5">final = base + OOS-бонус + надлишок · колір = ймовірність OOS</p>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse" style={{ minWidth: `${160 + prodSkus.length * 72}px` }}>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-left font-black text-[10px] uppercase tracking-widest text-slate-400 w-40 min-w-[160px]">
                  Магазин
                </th>
                {prodSkus.map(sku => (
                  <th key={sku.id} className="w-[68px] min-w-[68px] px-1 py-3 text-center font-black text-[9px] uppercase tracking-wide text-slate-400">
                    <span className="block" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 64, lineHeight: '1.2' }} title={sku.name}>
                      {shortName(sku.name)}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-black text-[10px] uppercase tracking-widest text-slate-400 w-20">Разом</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stores.map(store => {
                const storeTotal = prodSkus.reduce((s, k) => s + (getDistCell(store.id, k.id)?.final_qty ?? 0), 0);
                if (storeTotal === 0) return null;
                return (
                  <tr key={store.id} className="group transition-colors hover:bg-slate-50/60">
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-4 py-2.5 whitespace-nowrap w-40 min-w-[160px]">
                      <div className="font-bold text-slate-800 text-sm leading-tight">{store.name}</div>
                    </td>
                    {prodSkus.map(sku => {
                      const cell = getDistCell(store.id, sku.id);
                      if (!cell) return (
                        <td key={sku.id} className="w-[68px] px-1 py-2.5 text-center text-slate-200">—</td>
                      );
                      const prob = cell.oos_prob ?? 0;
                      const bg = prob >= 0.7 ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
                               : prob >= 0.5 ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
                               : prob >= 0.3 ? 'bg-yellow-50 text-slate-600'
                               : 'bg-emerald-50 text-slate-700';
                      const hasBonus = cell.oos_bonus > 0 || cell.surplus_bonus > 0;
                      return (
                        <td key={sku.id} className="w-[68px] px-1 py-2.5 text-center">
                          <div className={cn('inline-flex flex-col items-center justify-center rounded-xl px-2 py-1.5 w-[54px]', bg)}>
                            <span className="font-black text-base leading-none">{cell.final_qty}</span>
                            {hasBonus && (
                              <span className="text-[9px] font-bold opacity-70 mt-0.5">
                                {cell.base_qty}{cell.oos_bonus > 0 ? `+${cell.oos_bonus}` : ''}{cell.surplus_bonus > 0 ? `+${cell.surplus_bonus}` : ''}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right font-mono font-black text-slate-700 tabular-nums">{storeTotal}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="sticky left-0 bg-slate-50 px-4 py-3 font-black text-[11px] uppercase tracking-widest text-slate-500">Разом</td>
                {prodSkus.map(sku => {
                  const total = stores.reduce((s, st) => s + (getDistCell(st.id, sku.id)?.final_qty ?? 0), 0);
                  return (
                    <td key={sku.id} className="w-[68px] px-1 py-3 text-center font-mono font-black text-slate-700 tabular-nums">{total || '—'}</td>
                  );
                })}
                <td className="px-3 py-3 text-right font-mono font-black text-blue-700 tabular-nums">{totalOrder}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-t border-slate-100 bg-slate-50/50">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">OOS ризик:</span>
          {[
            { label: '< 30%', cls: 'bg-emerald-50 text-slate-700' },
            { label: '30–50%', cls: 'bg-yellow-50 text-slate-600' },
            { label: '50–70%', cls: 'bg-amber-100 text-amber-700' },
            { label: '> 70%', cls: 'bg-rose-100 text-rose-700' },
          ].map(l => (
            <span key={l.label} className={cn('px-2.5 py-1 rounded-lg text-[10px] font-bold', l.cls)}>{l.label}</span>
          ))}
          <span className="text-[10px] text-slate-400 ml-1">число = фінальна к-сть · підрядок = base+OOS+надлишок</span>
        </div>
      </div>
    </div>
  );
};
