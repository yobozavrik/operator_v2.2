'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import {
  ArrowLeft,
  BarChart3,
  Factory,
  Landmark,
  Package,
  ShoppingBag,
  Wallet,
} from 'lucide-react';
import {
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

type ModuleId = 'executive' | 'pnl' | 'cashflow' | 'stores' | 'production' | 'inventory';
type Role = 'owner' | 'cfo' | 'coo' | 'production_head' | 'store_ops' | 'finance_analyst' | 'restricted_viewer';
type Tone = 'good' | 'warn' | 'bad';

type Kpi = {
  label: string;
  value: string;
  delta: string;
  tone: Tone;
  trend: number[];
  formula: string;
};

type Drill = {
  type: 'store' | 'sku' | 'expense' | 'production' | 'inventory';
  name: string;
  context: string;
};

type OwnerFinanceKpi = {
  latest_business_date?: string;
  freshness_days?: number;
  revenue?: number | string;
  profit?: number | string;
  quantity?: number | string;
  margin_percent?: number | string;
  prev_revenue?: number | string;
  prev_profit?: number | string;
  prev_quantity?: number | string;
  revenue_diff_percent?: number | string | null;
  profit_diff_percent?: number | string | null;
  quantity_diff_percent?: number | string | null;
  margin_diff_pp?: number | string | null;
};

type OwnerOperationsKpi = {
  network_load_kg?: number | string;
  critical_sku?: number | string;
  critical_kg?: number | string;
  high_kg?: number | string;
  reserve_kg?: number | string;
  total_baked?: number | string;
  total_norm?: number | string;
  total_need?: number | string;
  production_coverage_percent?: number | string;
};

type OwnerStoreRow = {
  store_name?: string;
  revenue?: number | string;
  profit?: number | string;
  quantity?: number | string;
  margin_percent?: number | string;
};

type OwnerProductRow = {
  product_name?: string;
  category?: string;
  revenue?: number | string;
  profit?: number | string;
  quantity?: number | string;
  margin_percent?: number | string;
};

type OwnerTrendRow = {
  transaction_date?: string;
  revenue?: number | string;
  profit?: number | string;
  total_quantity?: number | string;
};

type OwnerCompareRow = {
  current_date?: string;
  previous_date?: string;
  current_revenue?: number | string;
  previous_revenue?: number | string;
};

type OwnerSummaryPayload = {
  finance_kpi?: OwnerFinanceKpi;
  operations_kpi?: OwnerOperationsKpi;
  top_stores_7d?: OwnerStoreRow[];
  top_products_7d?: OwnerProductRow[];
  revenue_trend_7d?: OwnerTrendRow[];
  revenue_compare_7d?: OwnerCompareRow[];
};

const modules = [
  { id: 'executive', label: 'Зведення', icon: BarChart3 },
  { id: 'pnl', label: 'Фінансовий результат', icon: Landmark },
  { id: 'cashflow', label: 'Грошовий потік', icon: Wallet },
  { id: 'stores', label: 'Магазини', icon: ShoppingBag },
  { id: 'production', label: 'Виробництво', icon: Factory },
  { id: 'inventory', label: 'Запаси та асортимент', icon: Package },
] as const;

const roles: Array<{ id: Role; label: string }> = [
  { id: 'owner', label: 'Власник' },
  { id: 'cfo', label: 'CFO' },
  { id: 'coo', label: 'COO' },
  { id: 'production_head', label: 'Керівник виробництва' },
  { id: 'store_ops', label: 'Операційний менеджер магазинів' },
  { id: 'finance_analyst', label: 'Фінансовий аналітик' },
  { id: 'restricted_viewer', label: 'Обмежений перегляд' },
];

const financialKpis: Kpi[] = [
  { label: 'Виручка', value: '14 700 000 грн', delta: '+6.2%', tone: 'good', trend: [12, 13, 12, 14, 15, 18, 17], formula: 'Виручка = продажі - повернення - знижки' },
  { label: 'Чиста виручка', value: '14 210 000 грн', delta: '+5.8%', tone: 'good', trend: [11.7, 12.2, 11.9, 13.1, 13.9, 14.2], formula: 'Чиста виручка = виручка - ПДВ - повернення' },
  { label: 'Валовий прибуток', value: '6 100 000 грн', delta: '-2.4%', tone: 'warn', trend: [5.6, 5.9, 5.8, 6.2, 6.4, 6.1], formula: 'Валовий прибуток = чиста виручка - собівартість реалізації' },
  { label: 'Валова маржа %', value: '42.9%', delta: '-1.1 п.п.', tone: 'warn', trend: [44.0, 43.5, 43.2, 43.4, 43.8, 42.9], formula: 'Валова маржа % = валовий прибуток / чиста виручка' },
  { label: 'Операційні витрати', value: '3 800 000 грн', delta: '+5.5%', tone: 'bad', trend: [3.2, 3.3, 3.5, 3.6, 3.7, 3.8], formula: 'Операційні витрати = витрати без собівартості реалізації' },
  { label: 'EBITDA', value: '2 300 000 грн', delta: '-1.4%', tone: 'warn', trend: [2.0, 2.2, 2.4, 2.1, 2.35, 2.3], formula: 'EBITDA = валовий прибуток - операційні витрати' },
  { label: 'EBITDA %', value: '16.2%', delta: '-0.7 п.п.', tone: 'warn', trend: [17.0, 16.8, 16.9, 16.5, 16.4, 16.2], formula: 'EBITDA % = EBITDA / чиста виручка' },
  { label: 'Чистий прибуток', value: '1 600 000 грн', delta: '-3.1%', tone: 'warn', trend: [1.5, 1.6, 1.7, 1.7, 1.65, 1.6], formula: 'Чистий прибуток = EBITDA - амортизація - % - податки' },
  { label: 'Чиста маржа %', value: '11.3%', delta: '-0.6 п.п.', tone: 'warn', trend: [12.1, 11.9, 11.8, 11.7, 11.5, 11.3], formula: 'Чиста маржа % = чистий прибуток / чиста виручка' },
  { label: 'ФОП', value: '2 180 000 грн', delta: '+6.3%', tone: 'bad', trend: [1.9, 2.0, 2.0, 2.1, 2.15, 2.18], formula: 'ФОП = зарплата + бонуси + податки на зарплату' },
  { label: 'Частка ФОП %', value: '15.3%', delta: '+0.8 п.п.', tone: 'bad', trend: [14.0, 14.4, 14.8, 15.0, 15.1, 15.3], formula: 'Частка ФОП % = ФОП / чиста виручка' },
];

const storeKpis: Kpi[] = [
  { label: 'Чеки', value: '18 943', delta: '+4.1%', tone: 'good', trend: [16.9, 17.1, 17.6, 18.1, 18.5, 18.9], formula: 'Чеки = кількість фіскальних чеків POS' },
  { label: 'Середній чек', value: '776 грн', delta: '+2.0%', tone: 'good', trend: [730, 742, 751, 763, 768, 776], formula: 'Середній чек = виручка / кількість чеків' },
  { label: 'Продажі/магазин', value: '639 130 грн', delta: '+3.6%', tone: 'good', trend: [590, 598, 607, 620, 631, 639], formula: 'Продажі/магазин = виручка / к-сть магазинів' },
  { label: 'EBITDA/магазин', value: '100 000 грн', delta: '-1.2%', tone: 'warn', trend: [104, 102, 101, 101, 100, 100], formula: 'EBITDA/магазин = EBITDA / к-сть магазинів' },
  { label: 'Списання %', value: '4.1%', delta: '+0.7 п.п.', tone: 'bad', trend: [3.3, 3.4, 3.6, 3.8, 4.0, 4.1], formula: 'Списання % = списання / виручка магазину' },
  { label: 'OOS %', value: '2.3%', delta: '-0.3 п.п.', tone: 'good', trend: [2.9, 2.8, 2.7, 2.6, 2.5, 2.3], formula: 'OOS % = відсутні SKU / активний асортимент' },
  { label: 'Продажі на працівника', value: '78 300 грн', delta: '+2.9%', tone: 'good', trend: [71, 72, 74, 75, 76, 78], formula: 'Продажі на працівника = виручка / к-сть працівників магазину' },
];

const productionKpis: Kpi[] = [
  { label: 'Випуск', value: '92 700 кг', delta: '+4.8%', tone: 'good', trend: [83, 85, 86, 89, 91, 92.7], formula: 'Випуск = загальний обсяг готової продукції' },
  { label: 'Собівартість кг', value: '89.4 грн', delta: '+1.9%', tone: 'warn', trend: [84.6, 85.0, 86.2, 87.6, 88.3, 89.4], formula: 'Собівартість кг = виробничі витрати / випуск кг' },
  { label: 'Втрати %', value: '2.7%', delta: '-0.2 п.п.', tone: 'good', trend: [3.3, 3.1, 3.0, 2.9, 2.8, 2.7], formula: 'Втрати % = втрати сировини / використана сировина' },
  { label: 'Брак %', value: '1.4%', delta: '+0.1 п.п.', tone: 'warn', trend: [1.1, 1.2, 1.2, 1.3, 1.3, 1.4], formula: 'Брак % = бракована продукція / випуск' },
  { label: 'Кг/працівника', value: '68.1 кг', delta: '+2.7%', tone: 'good', trend: [61, 62, 64, 65, 66, 68.1], formula: 'Кг/працівника = випуск кг / к-сть працівників цеху' },
  { label: 'Відхилення від плану', value: '-3.2%', delta: '+1.1 п.п.', tone: 'warn', trend: [-5.4, -5.0, -4.8, -4.1, -3.7, -3.2], formula: 'Відхилення = (факт - план) / план' },
];

const skuKpis: Kpi[] = [
  { label: 'Продажі SKU', value: '4 711 535 грн', delta: '+1.8%', tone: 'good', trend: [4.2, 4.3, 4.4, 4.5, 4.6, 4.71], formula: 'Продажі SKU = виручка по товарній позиції' },
  { label: 'Валова прибутковість SKU', value: '2 728 259 грн', delta: '-2.0%', tone: 'warn', trend: [2.5, 2.6, 2.7, 2.8, 2.75, 2.73], formula: 'Валова прибутковість SKU = продажі SKU - COGS SKU' },
  { label: 'Маржа внеску SKU', value: '1 932 000 грн', delta: '-1.7%', tone: 'warn', trend: [1.8, 1.85, 1.9, 1.95, 1.94, 1.93], formula: 'Маржа внеску SKU = валова прибутковість - логістика - списання - промо' },
  { label: 'Дні обіговості', value: '30.8 днів', delta: '-1.2 дн.', tone: 'good', trend: [34, 33, 32, 31.5, 31.2, 30.8], formula: 'Дні обіговості = середній запас / середньоденна собівартість реалізації' },
  { label: 'Поблизу терміну', value: '184 SKU', delta: '+7', tone: 'bad', trend: [148, 151, 159, 168, 176, 184], formula: 'Поблизу терміну = SKU з залишком і строком придатності нижче порогу' },
  { label: 'Списання %', value: '4.3%', delta: '+0.6 п.п.', tone: 'bad', trend: [3.2, 3.4, 3.6, 3.9, 4.1, 4.3], formula: 'Списання % = списання SKU / продажі SKU' },
];

const cashKpis: Kpi[] = [
  { label: 'Грошові кошти', value: '3 800 000 грн', delta: '+500 000', tone: 'good', trend: [3.1, 3.5, 3.3, 3.8], formula: 'Грошові кошти = вхідний залишок + надходження - виплати' },
  { label: 'Надходження', value: '4 600 000 грн', delta: '+3.3%', tone: 'good', trend: [4.1, 4.2, 4.3, 4.45, 4.5, 4.6], formula: 'Надходження = всі грошові надходження за період' },
  { label: 'Виплати', value: '4 000 000 грн', delta: '+4.1%', tone: 'warn', trend: [3.4, 3.5, 3.6, 3.8, 3.9, 4.0], formula: 'Виплати = всі грошові виплати за період' },
  { label: 'Темп витрачання', value: '133 000 грн/день', delta: '+5.0%', tone: 'bad', trend: [117, 119, 121, 126, 130, 133], formula: 'Темп витрачання = середньоденний чистий відтік грошових коштів' },
  { label: 'Прогноз касового розриву', value: '22 дні', delta: '-4 дні', tone: 'warn', trend: [31, 29, 28, 26, 24, 22], formula: 'Прогноз касового розриву = дата досягнення мінімального порогу грошових коштів' },
  { label: 'Графік оплат', value: '2 740 000 грн', delta: '+8.2%', tone: 'bad', trend: [2.1, 2.2, 2.3, 2.5, 2.6, 2.74], formula: 'Графік оплат = сума майбутніх зобовʼязань у платіжному календарі' },
];

const revenueTrend = [
  { day: 'Пн', fact: 1.95, plan: 1.9, prev: 1.82 },
  { day: 'Вт', fact: 2.05, plan: 2.0, prev: 1.9 },
  { day: 'Ср', fact: 1.88, plan: 1.95, prev: 1.84 },
  { day: 'Чт', fact: 2.22, plan: 2.1, prev: 1.96 },
  { day: 'Пт', fact: 2.43, plan: 2.3, prev: 2.1 },
  { day: 'Сб', fact: 2.96, plan: 2.75, prev: 2.62 },
  { day: 'Нд', fact: 2.73, plan: 2.6, prev: 2.48 },
];

const planFactRows = [
  ['Виручка', '14 700 000', '15 000 000', '-300 000', '-2.0%'],
  ['Валова прибуток', '6 100 000', '6 600 000', '-500 000', '-7.6%'],
  ['EBITDA', '2 300 000', '3 000 000', '-700 000', '-23.3%'],
  ['ФОТ', '2 180 000', '2 050 000', '+130 000', '+6.3%'],
  ['Списання', '412 000', '350 000', '+62 000', '+17.7%'],
  ['Cash', '3 800 000', '4 100 000', '-300 000', '-7.3%'],
];

const pnlRows = [
  ['Виручка', '14 700 000', '13 800 000', '45 200 000', '15 000 000', '-2.0%'],
  ['Собівартість', '8 600 000', '8 000 000', '26 100 000', '8 400 000', '+2.4%'],
  ['Валова прибуток', '6 100 000', '5 800 000', '19 100 000', '6 600 000', '-7.6%'],
  ['Логістика', '590 000', '540 000', '1 780 000', '560 000', '+5.4%'],
  ['ФОТ магазинів', '1 210 000', '1 150 000', '3 740 000', '1 140 000', '+6.1%'],
  ['ФОТ цехів', '970 000', '920 000', '2 980 000', '910 000', '+6.6%'],
  ['OPEX', '3 800 000', '3 500 000', '11 100 000', '3 600 000', '+5.5%'],
  ['EBITDA', '2 300 000', '2 300 000', '8 000 000', '3 000 000', '-23.3%'],
  ['Чистий прибуток', '1 600 000', '1 700 000', '5 900 000', '2 100 000', '-23.8%'],
];

const cashflowRows = [
  ['Вхідний залишок', '3 200 000'],
  ['Надходження', '4 600 000'],
  ['Оплата постачальникам', '-2 200 000'],
  ['ФОП + зарплати', '-1 300 000'],
  ['Оренда + комунальні', '-700 000'],
  ['Інші OPEX', '-400 000'],
  ['Вихідний залишок', '3 800 000'],
];

const storesRows = [
  ['Ентузіастів', '608 108', '58.2%', '132 000', '21.7%', '4.1%', '2.3%'],
  ['Героїв Майдану', '347 410', '55.9%', '61 000', '17.5%', '3.2%', '3.8%'],
  ['Руська', '288 980', '59.6%', '63 000', '21.8%', '6.1%', '5.2%'],
  ['Гравітон', '283 292', '38.2%', '18 000', '6.4%', '7.6%', '8.3%'],
];

const productionRows = [
  ['Гравітон', '42 600', '92.4', '3.8%', '4.4%', '68', '+6.9%'],
  ['Пакування', '31 200', '87.2', '2.6%', '2.9%', '71', '+3.4%'],
  ['Склад', '18 900', '73.1', '1.9%', '1.5%', '64', '+1.2%'],
];

const inventoryRows = [
  ['Пельмені свинина + курятина', '218 000', '12', '1.2%', '0.8%', '61.3%'],
  ['Вареники з картоплею', '164 000', '9', '0.9%', '0.4%', '78.5%'],
  ['Сирники', '146 000', '17', '2.1%', '1.6%', '51.9%'],
  ['Крафтовий хліб', '121 000', '8', '0.6%', '0.3%', '84.1%'],
  ['Напої', '85 000', '31', '4.8%', '5.2%', '17.5%'],
];

const analyticalScenarios = [
  'Чому виручка зросла, а EBITDA не зросла?',
  'Які магазини ростуть за рахунок знижок і втрачають маржу?',
  'Які SKU дають оборот, але зʼїдають прибуток?',
  'Які цехи формують найдорожчий випуск?',
  'Де кошти зависли в залишках і списаннях?',
  'Де просіла обіговість запасів?',
  'Що може призвести до касового розриву через 2–4 тижні?',
  'Які магазини недоукомплектовані та втрачають продажі?',
];

function asNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatMoney(value: unknown, digits = 0) {
  return `${new Intl.NumberFormat('uk-UA', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(asNumber(value))} грн`;
}

function formatNumeric(value: unknown, digits = 1) {
  return new Intl.NumberFormat('uk-UA', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(asNumber(value));
}

function formatPercentValue(value: unknown, digits = 1) {
  return `${formatNumeric(value, digits)}%`;
}

function formatDiff(value: unknown, suffix = '%') {
  const num = asNumber(value);
  const sign = num > 0 ? '+' : '';
  return `${sign}${formatNumeric(num, 2)}${suffix}`;
}

function toWeekday(dateIso: string | undefined) {
  if (!dateIso) return '—';
  return new Intl.DateTimeFormat('uk-UA', { weekday: 'short' })
    .format(new Date(`${dateIso}T00:00:00`))
    .replace('.', '');
}

function getKpisForModule(module: ModuleId): Kpi[] {
  if (module === 'pnl') return financialKpis;
  if (module === 'stores') return storeKpis;
  if (module === 'production') return productionKpis;
  if (module === 'inventory') return skuKpis;
  if (module === 'cashflow') return cashKpis;
  return [
    ...financialKpis.slice(0, 4),
    ...storeKpis.slice(0, 2),
    ...productionKpis.slice(0, 2),
    ...skuKpis.slice(0, 2),
    ...cashKpis.slice(0, 2),
  ];
}

export const FinancialDashboard = () => {
  const [active, setActive] = useState<ModuleId>('executive');
  const [role, setRole] = useState<Role>('cfo');
  const [drill, setDrill] = useState<Drill | null>(null);
  const { data } = useSWR<OwnerSummaryPayload>('/api/owner/summary', authedFetcher, {
    refreshInterval: 120000,
  });

  const availableModules = useMemo(() => modules.filter((m) => canViewModule(role, m.id)), [role]);
  const safeActive = availableModules.some((m) => m.id === active) ? active : availableModules[0]?.id ?? 'executive';
  const finance = data?.finance_kpi;
  const operations = data?.operations_kpi;

  const revenueTrendLive = useMemo(() => {
    if (data?.revenue_compare_7d?.length) {
      return data.revenue_compare_7d.map((row) => ({
        day: toWeekday(row.current_date),
        fact: asNumber(row.current_revenue) / 1000000,
        plan: asNumber(row.previous_revenue) / 1000000,
        prev: asNumber(row.previous_revenue) / 1000000,
      }));
    }
    if (data?.revenue_trend_7d?.length) {
      return data.revenue_trend_7d.map((row) => ({
        day: toWeekday(row.transaction_date),
        fact: asNumber(row.revenue) / 1000000,
        plan: asNumber(row.revenue) / 1000000,
        prev: asNumber(row.revenue) / 1000000,
      }));
    }
    return revenueTrend;
  }, [data]);

  const activeKpis = useMemo(() => {
    if (!finance && !operations) return getKpisForModule(safeActive);

    if (safeActive === 'pnl' || safeActive === 'executive') {
      const profitTrend = (data?.revenue_trend_7d?.length
        ? data.revenue_trend_7d.map((row) => asNumber(row.profit) / 1000000)
        : [0]);

      const financialLive: Kpi[] = [
        { label: 'Виручка', value: formatMoney(finance?.revenue), delta: formatDiff(finance?.revenue_diff_percent), tone: asNumber(finance?.revenue_diff_percent) >= 0 ? 'good' : 'warn', trend: revenueTrendLive.map((r) => r.fact), formula: 'Виручка = продажі - повернення - знижки' },
        { label: 'Чиста виручка', value: formatMoney(finance?.revenue), delta: 'н/д', tone: 'warn', trend: revenueTrendLive.map((r) => r.fact), formula: 'Чиста виручка = виручка - ПДВ - повернення (очікує окрему витрину)' },
        { label: 'Валовий прибуток', value: formatMoney(finance?.profit), delta: formatDiff(finance?.profit_diff_percent), tone: asNumber(finance?.profit_diff_percent) >= 0 ? 'good' : 'warn', trend: profitTrend, formula: 'Валовий прибуток = чиста виручка - собівартість реалізації' },
        { label: 'Валова маржа %', value: formatPercentValue(finance?.margin_percent, 2), delta: formatDiff(finance?.margin_diff_pp, ' п.п.'), tone: asNumber(finance?.margin_diff_pp) >= 0 ? 'good' : 'warn', trend: [asNumber(finance?.margin_percent)], formula: 'Валова маржа % = валовий прибуток / чиста виручка' },
        { label: 'Операційні витрати', value: 'н/д', delta: 'очікує витрину', tone: 'warn', trend: [0], formula: 'Операційні витрати = витрати без собівартості реалізації' },
        { label: 'EBITDA', value: 'н/д', delta: 'очікує витрину', tone: 'warn', trend: [0], formula: 'EBITDA = валовий прибуток - операційні витрати' },
        { label: 'EBITDA %', value: 'н/д', delta: 'очікує витрину', tone: 'warn', trend: [0], formula: 'EBITDA % = EBITDA / чиста виручка' },
        { label: 'Чистий прибуток', value: 'н/д', delta: 'очікує витрину', tone: 'warn', trend: [0], formula: 'Чистий прибуток = EBITDA - податки - відсотки - амортизація' },
        { label: 'Чиста маржа %', value: 'н/д', delta: 'очікує витрину', tone: 'warn', trend: [0], formula: 'Чиста маржа % = чистий прибуток / чиста виручка' },
        { label: 'ФОП', value: 'н/д', delta: 'очікує витрину', tone: 'warn', trend: [0], formula: 'ФОП = зарплата + бонуси + податки на зарплату' },
        { label: 'Частка ФОП %', value: 'н/д', delta: 'очікує витрину', tone: 'warn', trend: [0], formula: 'Частка ФОП % = ФОП / чиста виручка' },
      ];
      return safeActive === 'pnl' ? financialLive : financialLive.slice(0, 6);
    }

    return getKpisForModule(safeActive);
  }, [data, finance, operations, revenueTrendLive, safeActive]);

  const scopedStores = useMemo(() => {
    const source = data?.top_stores_7d?.length
      ? data.top_stores_7d.map((row) => [
          row.store_name || '—',
          formatNumeric(row.revenue, 0),
          formatPercentValue(row.margin_percent, 2),
          formatNumeric(row.profit, 0),
          'н/д',
          'н/д',
          'н/д',
        ])
      : storesRows;
    if (role === 'store_ops') return source.filter((r) => r[0] === 'Руська');
    if (role === 'restricted_viewer') return source.slice(0, 2);
    return source;
  }, [data, role]);

  const scopedProduction = useMemo(() => {
    const source = operations
      ? [[
          'Мережа',
          formatNumeric(operations.network_load_kg, 1),
          'н/д',
          'н/д',
          'н/д',
          formatNumeric(operations.total_baked, 0),
          formatPercentValue(asNumber(operations.production_coverage_percent) * 100, 1),
        ]]
      : productionRows;
    if (role === 'production_head') return source.filter((r) => r[0] === 'Мережа' || r[0] === 'Гравітон');
    if (role === 'restricted_viewer') return source.slice(0, 1);
    return source;
  }, [operations, role]);

  const inventoryRowsLive = useMemo(() => {
    if (!data?.top_products_7d?.length) return inventoryRows;
    return data.top_products_7d.slice(0, 20).map((row) => [
      row.product_name || '—',
      formatNumeric(row.revenue, 0),
      'н/д',
      'н/д',
      'н/д',
      formatPercentValue(row.margin_percent, 2),
    ]);
  }, [data]);

  const planFactRowsLive = useMemo(() => {
    if (!finance) return planFactRows;
    return [
      ['Виручка', formatNumeric(finance.revenue, 0), 'н/д', 'н/д', formatDiff(finance.revenue_diff_percent)],
      ['Валовий прибуток', formatNumeric(finance.profit, 0), 'н/д', 'н/д', formatDiff(finance.profit_diff_percent)],
      ['Маржа %', formatPercentValue(finance.margin_percent, 2), 'н/д', 'н/д', formatDiff(finance.margin_diff_pp, ' п.п.')],
      ['Обсяг (кг)', formatNumeric(finance.quantity, 0), 'н/д', 'н/д', formatDiff(finance.quantity_diff_percent)],
      ['Свіжість даних', `${formatNumeric(finance.freshness_days, 0)} дн.`, '≤1 день', 'н/д', 'контроль'],
    ];
  }, [finance]);

  const pnlRowsLive = useMemo(() => {
    if (!finance) return pnlRows;
    const revenue = asNumber(finance.revenue);
    const profit = asNumber(finance.profit);
    return [
      ['Виручка', formatNumeric(revenue, 0), formatNumeric(asNumber(finance.prev_revenue), 0), 'н/д', 'н/д', formatDiff(finance.revenue_diff_percent)],
      ['Валовий прибуток', formatNumeric(profit, 0), formatNumeric(asNumber(finance.prev_profit), 0), 'н/д', 'н/д', formatDiff(finance.profit_diff_percent)],
      ['Валова маржа %', formatPercentValue(finance.margin_percent, 2), 'н/д', 'н/д', 'н/д', formatDiff(finance.margin_diff_pp, ' п.п.')],
      ['Операційні витрати', 'н/д', 'н/д', 'н/д', 'н/д', 'очікує витрину'],
      ['EBITDA', 'н/д', 'н/д', 'н/д', 'н/д', 'очікує витрину'],
      ['Чистий прибуток', 'н/д', 'н/д', 'н/д', 'н/д', 'очікує витрину'],
    ];
  }, [finance]);

  const cashflowRowsLive = useMemo(() => {
    if (!finance) return cashflowRows;
    return [
      ['Вхідний залишок', formatNumeric(finance.prev_revenue, 0)],
      ['Надходження', formatNumeric(finance.revenue, 0)],
      ['Виплати', 'н/д'],
      ['Чистий потік', 'н/д'],
      ['Вихідний залишок', formatNumeric(finance.profit, 0)],
      ['Прогноз касового розриву', 'очікує витрину'],
    ];
  }, [finance]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(219,234,254,0.45),_transparent_32%),linear-gradient(180deg,_#f6f9ff_0%,_#edf3fb_100%)] px-4 py-6 text-slate-900 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.10)] md:p-8">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950">
              <ArrowLeft size={16} /> Головне меню
            </Link>
            <Link href="/owner" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950">
              До власника
            </Link>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
              {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-blue-700">Контур CFO</div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 md:text-5xl">Управлінська фінансово-операційна система</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600 md:text-base">Єдина версія правди для 23 магазинів і 9 цехів: фінанси, операційка, виробництво, SKU та грошовий потік.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {activeKpis.slice(0, 3).map((kpi) => <KpiCard key={kpi.label} kpi={kpi} compact />)}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {['Період: 30 днів', 'Магазин: всі', 'Цех: всі', 'Категорія: всі', 'SKU: всі', 'Стаття: всі'].map((f) => (
              <button key={f} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">{f}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableModules.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === safeActive;
              return (
                <button key={item.id} onClick={() => setActive(item.id)} className={cn('inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition', isActive ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900')}>
                  <Icon size={16} /> {item.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="mb-6 flex items-end justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Модуль</div>
              <h2 className="text-2xl font-bold text-slate-950">{modules.find((m) => m.id === safeActive)?.label}</h2>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">Оновлення: щоденно 07:00</div>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
              {activeKpis.map((kpi) => <KpiCard key={`${safeActive}-${kpi.label}`} kpi={kpi} />)}
            </div>

            {(safeActive === 'executive' || safeActive === 'pnl') && (
              <DataTable title="План / Факт" headers={['Показник', 'Факт (грн)', 'План (грн)', 'Відхилення (грн)', 'Відхилення %']} rows={planFactRowsLive} />
            )}

            {(safeActive === 'executive' || safeActive === 'cashflow') && (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <SectionCard title="Динаміка виручки 7 днів" subtitle="Поточний період / попередній період"><TrendChart data={revenueTrendLive} /></SectionCard>
                <DataTable title="Грошовий потік" headers={['Стаття', 'Сума (грн)']} rows={cashflowRowsLive} />
              </div>
            )}

            {(safeActive === 'executive' || safeActive === 'pnl') && (
              <DataTable title="Фінрезультат: факт vs план" headers={['Стаття', 'Поточний', 'Минулий', 'YTD', 'План', 'Відхилення %']} rows={pnlRowsLive} onRowClick={(row) => setDrill({ type: 'expense', name: row[0], context: 'Деталізація первинних документів' })} />
            )}

            {(safeActive === 'executive' || safeActive === 'stores') && (
              <DataTable title="Економіка магазинів" headers={['Магазин', 'Виручка', 'Маржа %', 'EBITDA', 'EBITDA %', 'Списання %', 'OOS %']} rows={scopedStores} onRowClick={(row) => setDrill({ type: 'store', name: row[0], context: 'Картка магазину' })} />
            )}

            {(safeActive === 'executive' || safeActive === 'production') && (
              <DataTable title="Економіка цехів" headers={['Цех', 'Випуск кг', 'Собівартість кг', 'Втрати %', 'Списання %', 'Кг/співр.', 'Відхилення']} rows={scopedProduction} onRowClick={(row) => setDrill({ type: 'production', name: row[0], context: 'Картка цеху' })} />
            )}

            {(safeActive === 'executive' || safeActive === 'inventory') && (
              <DataTable title="Запаси та економіка SKU" headers={['SKU', 'Продажі (грн)', 'Обіг (дні)', 'Списання %', 'OOS %', 'Маржа %']} rows={inventoryRowsLive} onRowClick={(row) => setDrill({ type: 'sku', name: row[0], context: 'Картка товару' })} />
            )}
          </div>
        </section>

        {drill && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-500">Деталізація</div>
            <h3 className="text-xl font-bold text-slate-950">{drill.name}</h3>
            <p className="mt-1 text-sm text-slate-600">{drill.context}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <DrillField label="Сценарій" value={drill.type} />
              <DrillField label="Наступний крок" value="Відкрити деталізацію документів" />
              <DrillField label="Статус" value="Готово до інтеграції з Supabase" />
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Ключові сценарії аналізу</div>
          <h3 className="mt-2 text-xl font-bold text-slate-950">Швидкі питання CFO/COO для прийняття рішень</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {analyticalScenarios.map((item) => (
              <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
};

function canViewModule(role: Role, module: ModuleId) {
  if (role === 'owner' || role === 'cfo' || role === 'finance_analyst') return true;
  if (role === 'coo') return module !== 'cashflow';
  if (role === 'production_head') return ['executive', 'production', 'inventory'].includes(module);
  if (role === 'store_ops') return ['executive', 'stores', 'inventory'].includes(module);
  if (role === 'restricted_viewer') return ['executive', 'pnl'].includes(module);
  return false;
}

function KpiCard({ kpi, compact = false }: { kpi: Kpi; compact?: boolean }) {
  const max = Math.max(1, ...kpi.trend);
  return (
    <div title={kpi.formula} className={cn('rounded-2xl border border-slate-200 bg-slate-50 p-4', compact && 'min-w-[190px]')}>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{kpi.label}</div>
      <div className="mt-2 text-xl font-bold text-slate-950">{kpi.value}</div>
      <div className={cn('mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold', kpi.tone === 'good' && 'bg-emerald-50 text-emerald-700', kpi.tone === 'warn' && 'bg-amber-50 text-amber-700', kpi.tone === 'bad' && 'bg-red-50 text-red-700')}>
        {kpi.delta}
      </div>
      <div className="mt-3 flex items-end gap-1">
        {kpi.trend.map((v, i) => (
          <div key={i} className={cn('w-2 rounded-sm', kpi.tone === 'bad' ? 'bg-red-300' : kpi.tone === 'warn' ? 'bg-amber-300' : 'bg-emerald-300')} style={{ height: `${Math.max(6, (v / max) * 18)}px` }} />
        ))}
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#fff,#f8fafc)] p-5 shadow-sm">
      <div className="mb-4">
        <div className="text-lg font-semibold text-slate-950">{title}</div>
        <div className="text-sm text-slate-600">{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function DataTable({ title, headers, rows, onRowClick }: { title: string; headers: string[]; rows: string[][]; onRowClick?: (row: string[]) => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[780px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500" style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0,1fr))` }}>
          {headers.map((h) => <div key={h}>{h}</div>)}
        </div>
        <div className="divide-y divide-slate-200">
          {rows.map((row) => (
            <button key={row.join('|')} onClick={() => onRowClick?.(row)} className={cn('grid min-w-[780px] w-full gap-3 px-5 py-3 text-left text-sm text-slate-700', onRowClick && 'hover:bg-slate-50')} style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0,1fr))` }}>
              {row.map((cell, i) => <div key={`${cell}-${i}`} className={cn(i === 0 && 'font-semibold text-slate-950')}>{cell}</div>)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrendChart({ data }: { data: Array<{ day: string; fact: number; plan: number; prev: number }> }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(v) => `${v.toFixed(1)}M`} />
          <Tooltip formatter={(v: number) => `${v.toFixed(2)}M грн`} contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }} />
          <Line type="monotone" dataKey="fact" stroke="#0f766e" strokeWidth={2.5} dot={false} name="Факт" />
          <Line type="monotone" dataKey="plan" stroke="#2563eb" strokeWidth={2.2} dot={false} name="План" />
          <Line type="monotone" dataKey="prev" stroke="#94a3b8" strokeWidth={2} dot={false} name="Минулий" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DrillField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}
