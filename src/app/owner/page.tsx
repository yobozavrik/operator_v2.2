'use client';

import Link from 'next/link';
import type { ComponentType } from 'react';
import useSWR from 'swr';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Briefcase,
  Factory,
  PieChart,
  ShieldAlert,
  Store,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { authedFetcher } from '@/lib/authed-fetcher';
import { cn } from '@/lib/utils';

const fetcher = authedFetcher;
const UNMAPPED_CATEGORY = '\u0411\u0435\u0437 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0456\u0457';

type FinanceKpi = {
  latest_business_date: string;
  freshness_days: number;
  revenue: number;
  profit: number;
  quantity: number;
  margin_percent: number;
  prev_revenue: number;
  prev_profit: number;
  prev_quantity: number;
  revenue_diff_percent: number | null;
  profit_diff_percent: number | null;
  quantity_diff_percent: number | null;
  margin_diff_pp: number;
};

type OperationsKpi = {
  network_load_kg: number;
  critical_sku: number;
  critical_kg: number;
  high_kg: number;
  reserve_kg: number;
  total_baked: number;
  total_norm: number;
  total_need: number;
  production_coverage_percent: number;
};

type StoreRow = {
  store_name: string;
  revenue: number;
  profit: number;
  quantity: number;
  margin_percent: number;
};

type CategoryRow = {
  category: string;
  revenue: number;
  profit: number;
  quantity: number;
  margin_percent: number;
};

type ProductRow = {
  category: string;
  product_name: string;
  quantity: number;
  revenue: number;
  profit: number;
  margin_percent: number;
};

type CompareRow = {
  day_index: number;
  current_date: string;
  previous_date: string;
  current_revenue: number;
  previous_revenue: number;
  current_profit: number;
  previous_profit: number;
  current_quantity: number;
  previous_quantity: number;
};

type AlertRow = {
  type: string;
  title: string;
  message: string;
  value?: number;
  store_name?: string;
  margin_percent?: number;
};

type OwnerDashboardPayload = {
  finance_kpi?: FinanceKpi;
  operations_kpi?: OperationsKpi;
  top_stores_7d?: StoreRow[];
  top_categories_7d?: CategoryRow[];
  top_products_7d?: ProductRow[];
  revenue_compare_7d?: CompareRow[];
  alerts?: AlertRow[];
};

type CompareChartRow = CompareRow & {
  label: string;
  weekdayLabel: string;
  qualityFlag: boolean;
};

function formatCurrency(value: number | undefined) {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function formatCompactCurrency(value: number | undefined) {
  return new Intl.NumberFormat('uk-UA', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value ?? 0);
}

function formatNumber(value: number | undefined, digits = 0) {
  return new Intl.NumberFormat('uk-UA', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value ?? 0);
}

function formatPercent(value: number | undefined, digits = 1) {
  return `${formatNumber(value, digits)}%`;
}

function formatDate(value: string | undefined) {
  if (!value) return 'Немає даних';
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatShortDate(value: string | undefined) {
  if (!value) return 'н/д';
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

function diffLabel(value: number | null | undefined, suffix = '%') {
  if (value === null || value === undefined || Number.isNaN(value)) return 'н/д';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value, 2)}${suffix}`;
}

function diffTone(value: number | null | undefined) {
  if (value === null || value === undefined) return 'text-slate-500';
  if (value > 0) return 'text-emerald-600';
  if (value < 0) return 'text-red-600';
  return 'text-slate-500';
}

function toWeekdayLabel(value: string) {
  return new Intl.DateTimeFormat('uk-UA', { weekday: 'short' })
    .format(new Date(`${value}T00:00:00`))
    .replace('.', '');
}

export default function OwnerPage() {
  const { data, error, isLoading } = useSWR<OwnerDashboardPayload>('/api/owner/summary', fetcher, {
    refreshInterval: 120000,
  });

  const finance = data?.finance_kpi;
  const operations = data?.operations_kpi;
  const topStore = data?.top_stores_7d?.[0];
  const topCategory = data?.top_categories_7d?.[0];
  const topProduct = data?.top_products_7d?.[0];
  const alerts = data?.alerts || [];
  const riskStoreAlert = alerts.find((item) => item.type === 'store_margin');
  const dataQualityAlert = alerts.find((item) => item.type === 'data_quality');
  const compare: CompareChartRow[] = (data?.revenue_compare_7d || []).map((item) => ({
    ...item,
    label: formatShortDate(item.current_date),
    weekdayLabel: toWeekdayLabel(item.current_date),
    qualityFlag:
      item.current_revenue > item.previous_revenue &&
      item.current_profit < item.previous_profit,
  }));
  const qualityDays = compare.filter((item) => item.qualityFlag);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc,_#eef4ff_45%,_#f8fafc)] px-4 py-6 text-slate-900 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                <Briefcase size={14} />
                Контур власника
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 md:text-5xl">
                Дашборд власника
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                Ключові сигнали за останні 7 днів: виручка, прибуток, операційний стан мережі та цехів.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:min-w-[460px]">
              <MetricCard
                label="Виручка 7д"
                value={finance ? formatCurrency(finance.revenue) : '...'}
              />
              <MetricCard
                label="Маржа"
                value={finance ? formatPercent(finance.margin_percent, 2) : '...'}
              />
              <MetricCard
                label="Критичних SKU"
                value={operations ? formatNumber(operations.critical_sku) : '...'}
                critical={Boolean(operations && operations.critical_sku > 0)}
              />
              <MetricCard
                label="Актуальність"
                value={finance ? `${formatNumber(finance.freshness_days)} дн` : '...'}
                critical={Boolean(finance && finance.freshness_days > 1)}
              />
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-800 shadow-sm md:p-8">
            <div className="text-sm font-semibold">Помилка завантаження дашборду власника.</div>
            <div className="mt-2 text-sm opacity-80">
              Перевірте `/api/owner/summary`, стан авторизації та доступ до
              `executive.owner_dashboard`.
            </div>
          </section>
        ) : null}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">
                  Зведений звіт
                </div>
                <h2 className="mt-4 text-2xl font-bold text-slate-950">
                  Стан мережі на {formatDate(finance?.latest_business_date)}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Виручка зростає, але якість прибутку слабша: прибуток та маржа
                  нижчі відносно попереднього 7-денного вікна.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right text-xs text-slate-600">
                <div className="font-bold uppercase tracking-[0.18em] text-slate-500">
                  Джерело даних
                </div>
                <div className="mt-1">
                  <code>executive.owner_dashboard</code>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ExecutiveCard
                icon={Wallet}
                title="Виручка"
                value={finance ? formatCurrency(finance.revenue) : '...'}
                note={
                  finance
                    ? `до попер.: ${diffLabel(finance.revenue_diff_percent)}`
                    : isLoading
                      ? 'Завантаження...'
                      : 'Немає даних'
                }
                tone={finance?.revenue_diff_percent ?? 0}
              />
              <ExecutiveCard
                icon={TrendingUp}
                title="Прибуток"
                value={finance ? formatCurrency(finance.profit) : '...'}
                note={
                  finance
                    ? `Зміна: ${diffLabel(finance.profit_diff_percent)}`
                    : isLoading
                      ? 'Завантаження...'
                      : 'Немає даних'
                }
                tone={finance?.profit_diff_percent ?? 0}
              />
              <ExecutiveCard
                icon={BarChart3}
                title="Маржа"
                value={finance ? formatPercent(finance.margin_percent, 2) : '...'}
                note={
                  finance
                    ? `Дельта: ${diffLabel(finance.margin_diff_pp, ' п.п.')}`
                    : isLoading
                      ? 'Завантаження...'
                      : 'Немає даних'
                }
                tone={finance?.margin_diff_pp ?? 0}
              />
              <ExecutiveCard
                icon={Factory}
                title="Навантаження"
                value={operations ? `${formatNumber(operations.network_load_kg, 1)} кг` : '...'}
                note={
                  operations
                    ? `${formatNumber(operations.critical_kg, 1)} кг критичних`
                    : isLoading
                      ? 'Завантаження...'
                      : 'Немає даних'
                }
                tone={operations && operations.critical_sku > 0 ? -1 : 1}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-xl font-bold text-slate-950">Головні сигнали</h2>
            <div className="mt-4 space-y-3">
              <HighlightRow
                icon={Store}
                label="Кращий магазин"
                value={topStore?.store_name || 'Немає даних'}
                detail={
                  topStore
                    ? `${formatCurrency(topStore.revenue)} | маржа ${formatPercent(topStore.margin_percent, 2)}`
                    : '...'
                }
              />
              <HighlightRow
                icon={ShieldAlert}
                label="Ризиковий магазин"
                value={riskStoreAlert?.store_name || 'Сигналів немає'}
                detail={riskStoreAlert?.message || '...'}
              />
              <HighlightRow
                icon={TrendingUp}
                label="Топ позиція"
                value={topProduct?.product_name?.trim() || 'Немає даних'}
                detail={
                  topProduct
                    ? `${formatCurrency(topProduct.revenue)} | ${topProduct.category}`
                    : '...'
                }
              />
              <HighlightRow
                icon={AlertTriangle}
                label="Якість даних"
                value={topCategory?.category || 'Немає даних'}
                detail={dataQualityAlert?.message || '...'}
              />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] border border-slate-700/70 bg-[radial-gradient(circle_at_top,_rgba(30,41,59,0.9),_rgba(15,23,42,0.98))] p-6 text-slate-100 shadow-[0_20px_60px_rgba(15,23,42,0.45)] md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-300">
                  <BarChart3 size={14} />
                  Тренд виручки
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Поточні 7 днів vs попередні 7 днів
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <div className="flex items-center gap-2 text-emerald-300">
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                  Поточний
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="h-3 w-3 rounded-full border border-dashed border-slate-400" />
                  Попередній
                </div>
              </div>
            </div>

            <div className="mt-6 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={compare} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="4 4"
                    stroke="rgba(148,163,184,0.14)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="weekdayLabel"
                    tickLine={false}
                    axisLine={false}
                    stroke="#94a3b8"
                    fontSize={12}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    stroke="#94a3b8"
                    fontSize={12}
                    tickFormatter={(value) => formatCompactCurrency(Number(value))}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(Number(value)),
                      name === 'current_revenue' ? 'Поточний' : 'Попередній',
                    ]}
                    labelFormatter={(label) => `День: ${label}`}
                    contentStyle={{
                      borderRadius: 18,
                      borderColor: 'rgba(148,163,184,0.18)',
                      backgroundColor: '#0f172a',
                      color: '#e2e8f0',
                    }}
                    itemStyle={{ color: '#e2e8f0' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="previous_revenue"
                    name="Previous"
                    stroke="#64748b"
                    strokeWidth={2}
                    strokeDasharray="5 6"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="current_revenue"
                    name="Current"
                    stroke="#22c55e"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#f8fafc', stroke: '#22c55e', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#ffffff', stroke: '#22c55e', strokeWidth: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-xl font-bold text-slate-950">Якість зростання</h2>
            <div className="mt-5 space-y-4">
              <DeltaRow
                label="Виручка"
                current={finance ? formatCurrency(finance.revenue) : '...'}
                delta={finance?.revenue_diff_percent}
              />
              <DeltaRow
                label="Прибуток"
                current={finance ? formatCurrency(finance.profit) : '...'}
                delta={finance?.profit_diff_percent}
              />
              <DeltaRow
                label="Маржа"
                current={finance ? formatPercent(finance.margin_percent, 2) : '...'}
                delta={finance?.margin_diff_pp}
                suffix=" pp"
              />
              <div
                className={cn(
                  'rounded-2xl border p-4',
                  qualityDays.length > 0
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-emerald-200 bg-emerald-50',
                )}
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Дні слабкого зростання
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-950">
                  {formatNumber(qualityDays.length)}
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  {qualityDays.length > 0
                    ? `У ${formatNumber(qualityDays.length)} дн. виручка зросла, але прибуток впав відносно аналогічного дня попереднього тижня.`
                    : 'Днів, де виручка зростала, а прибуток падав, не знайдено.'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                {qualityDays.length > 0
                  ? `Проблемні дні: ${qualityDays.map((item) => item.label).join(', ')}`
                  : 'Якість зростання стабільна в поточному вікні.'}
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Тренд прибутку</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Показує де зростання виручки не призвело до покращення прибутку.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <div>
                  Поточний:{' '}
                  <span className="font-semibold text-blue-700">
                    {formatCompactCurrency(finance?.profit)}
                  </span>
                </div>
                <div className="mt-1">
                  Попередній:{' '}
                  <span className="font-semibold text-slate-700">
                    {formatCompactCurrency(finance?.prev_profit)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={compare} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    stroke="#64748b"
                    fontSize={12}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    stroke="#64748b"
                    fontSize={12}
                    tickFormatter={(value) => formatCompactCurrency(Number(value))}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(Number(value)),
                      name === 'current_profit' ? 'Поточний' : 'Попередній',
                    ]}
                    labelFormatter={(label) => `День: ${label}`}
                    contentStyle={{ borderRadius: 16, borderColor: '#e2e8f0' }}
                  />
                  <Bar
                    dataKey="previous_profit"
                    name="Попередній"
                    fill="#bfdbfe"
                    radius={[8, 8, 0, 0]}
                  />
                  <Bar
                    dataKey="current_profit"
                    name="Поточний"
                    fill="#2563eb"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-xl font-bold text-slate-950">Операційні сигнали</h2>
            <div className="mt-5 space-y-4">
              <ActionCard
                title="Критичні SKU"
                note={
                  operations
                    ? `${formatNumber(operations.critical_sku)} SKU та ${formatNumber(operations.critical_kg, 1)} кг потребують уваги.`
                    : '...'
                }
              />
              <ActionCard
                title="Навантаження в зоні ризику"
                note={
                  operations
                    ? `${formatNumber(operations.high_kg, 1)} кг наразі в зоні підвищеного ризику.`
                    : '...'
                }
              />
              <ActionCard
                title="Покриття виробництва"
                note={
                  operations
                    ? `Поточне значення ${formatPercent(operations.production_coverage_percent, 2)} — потребує перевірки одиниць виміру.`
                    : '...'
                }
              />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-xl font-bold text-slate-950">Топ магазини</h2>
            <div className="mt-5 space-y-3">
              {(data?.top_stores_7d || []).slice(0, 8).map((store, index) => (
                <RankRow
                  key={store.store_name}
                  rank={index + 1}
                  name={store.store_name}
                  meta={`Маржа ${formatPercent(store.margin_percent, 2)}`}
                  value={formatCurrency(store.revenue)}
                />
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-xl font-bold text-slate-950">Топ категорії</h2>
            <div className="mt-5 space-y-3">
              {(data?.top_categories_7d || []).slice(0, 8).map((category, index) => (
                <RankRow
                  key={category.category}
                  rank={index + 1}
                  name={category.category}
                  meta={`Маржа ${formatPercent(category.margin_percent, 2)}`}
                  value={formatCurrency(category.revenue)}
                  critical={category.category === UNMAPPED_CATEGORY}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm md:p-8">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-emerald-600">
              <PieChart size={18} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-950">Контроль фудкосту</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Собівартість, маржа, нормативний аналіз та AI-рекомендації по позиціях
              </p>
            </div>
            <Link
              href="/owner/foodcost"
              className="ml-auto flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              Відкрити <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Позиції', note: 'ФК% по кожній позиції та категорії' },
              { label: 'Матриця', note: 'Зірки / корови / баласт' },
              { label: 'Прогноз', note: 'Тренд ФК на наступний тиждень' },
              { label: 'Норматив', note: 'ФК з техкарт vs операційний' },
            ].map(({ label, note }) => (
              <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 text-xs text-slate-600">{note}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Деталізація</h2>
              <p className="mt-1 text-sm text-slate-600">
                Відкрийте детальні модулі, коли зведений звіт виявить проблему, що потребує глибшого аналізу.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <NavCard
                href="/finance"
                title="Фінанси"
                note="Детальний фінансовий модуль та поглиблений аналіз."
              />
              <NavCard
                href="/ops"
                title="Операції"
                note="Критичні позиції, навантаження та реакція мережі."
              />
              <NavCard
                href="/forecasting"
                title="Прогнозування"
                note="Сценарії попиту з аналітичного шару Supabase."
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  critical = false,
}: {
  label: string;
  value: string;
  critical?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        critical ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50',
      )}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
    </div>
  );
}

function ExecutiveCard({
  icon: Icon,
  title,
  value,
  note,
  tone,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  value: string;
  note: string;
  tone: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-2 text-slate-700">
          <Icon size={18} />
        </div>
        <div className={cn('text-xs font-semibold', diffTone(tone))}>
          {tone >= 0 ? (
            <TrendingUp size={14} className="inline" />
          ) : (
            <TrendingDown size={14} className="inline" />
          )}
        </div>
      </div>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-2 text-sm text-slate-600">{note}</div>
    </div>
  );
}

function HighlightRow({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-2 text-slate-700">
          <Icon size={16} />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {label}
          </div>
          <div className="mt-1 font-semibold text-slate-950">{value}</div>
          <div className="mt-1 text-sm text-slate-600">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function DeltaRow({
  label,
  current,
  delta,
  suffix = '%',
}: {
  label: string;
  current: string;
  delta: number | null | undefined;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div>
        <div className="text-sm font-semibold text-slate-950">{label}</div>
        <div className="text-xs text-slate-500">Current value: {current}</div>
      </div>
      <div className={cn('text-sm font-bold', diffTone(delta))}>{diffLabel(delta, suffix)}</div>
    </div>
  );
}

function ActionCard({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-600">{note}</div>
    </div>
  );
}

function RankRow({
  rank,
  name,
  meta,
  value,
  critical = false,
}: {
  rank: number;
  name: string;
  meta: string;
  value: string;
  critical?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl border px-4 py-4',
        critical ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50',
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700">
        {rank}
      </div>
      <div>
        <div className="font-semibold text-slate-950">{name}</div>
        <div className="text-xs text-slate-500">{meta}</div>
      </div>
      <div className="text-right font-bold text-slate-950">{value}</div>
    </div>
  );
}

function NavCard({ href, title, note }: { href: string; title: string; note: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-slate-300 hover:bg-slate-100"
    >
      <div>
        <div className="font-semibold text-slate-950">{title}</div>
        <div className="text-xs text-slate-600">{note}</div>
      </div>
      <ArrowRight size={18} className="text-slate-400" />
    </Link>
  );
}
