'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Factory, ChevronRight, Boxes, CakeSlice, Pizza, Store, BarChart3 } from 'lucide-react';
import { authedFetcher } from '@/lib/authed-fetcher';
import { RoleShell, ShellMetric } from '@/components/role-shell';
import { cn } from '@/lib/utils';

const fetcher = authedFetcher;

type SummaryResponse = {
  fill_index?: number;
};

type MetricsResponse = {
  criticalSKU?: number;
  shopLoad?: number;
};

export default function WorkshopsPage() {
  const { data: graviton } = useSWR<MetricsResponse>('/api/graviton/metrics', fetcher, { refreshInterval: 30000 });
  const { data: pizza } = useSWR<SummaryResponse>('/api/pizza/summary', fetcher, { refreshInterval: 60000 });
  const { data: konditerka } = useSWR<SummaryResponse>('/api/konditerka/summary', fetcher, { refreshInterval: 60000 });
  const { data: bulvar } = useSWR<SummaryResponse>('/api/bulvar/summary', fetcher, { refreshInterval: 60000 });

  const workshops = [
    {
      title: 'Гравитон',
      note: 'Заморозка, мережа, дефіцити',
      href: '/graviton',
      icon: Boxes,
      state: (graviton?.criticalSKU || 0) > 0 ? 'critical' : 'stable',
      metric: `${graviton?.criticalSKU || 0} крит. SKU`,
    },
    {
      title: 'Пицца',
      note: 'Випуск, заявка, виробництво',
      href: '/pizza',
      icon: Pizza,
      state: (pizza?.fill_index || 0) >= 100 ? 'stable' : 'risk',
      metric: `Fill ${Math.round(pizza?.fill_index || 0)}%`,
    },
    {
      title: 'Кондитерка',
      note: 'Десерти та випуск',
      href: '/konditerka',
      icon: CakeSlice,
      state: (konditerka?.fill_index || 0) >= 100 ? 'stable' : 'risk',
      metric: `Fill ${Math.round(konditerka?.fill_index || 0)}%`,
    },
    {
      title: 'Бульвар',
      note: 'Напрям і виробничі зрізи',
      href: '/bulvar',
      icon: Store,
      state: (bulvar?.fill_index || 0) >= 100 ? 'stable' : 'risk',
      metric: `Покриття ${Math.round(bulvar?.fill_index || 0)}%`,
    },
    {
      title: 'Флорида',
      note: 'Напівфабрикати й кулінарія',
      href: '/florida',
      icon: Factory,
      state: 'neutral',
      metric: 'Виробничий перегляд',
    },
    {
      title: 'Пекарня',
      note: 'Аналітичний модуль напряму',
      href: '/bakery',
      icon: BarChart3,
      state: 'neutral',
      metric: 'Аналітика',
    },
    {
      title: 'Садова',
      note: 'Цех Садова: розподіл випуску',
      href: '/sadova',
      icon: Factory,
      state: 'stable',
      metric: 'Розподіл',
    },
  ] as const;

  return (
    <RoleShell
      badge="Шар цехів"
      title="Цехи та напрями"
      description="Проміжний шар між роллю та конкретним модулем. Тут користувач обирає потрібний напрям уже після вибору управлінського контексту."
      accent="blue"
      metrics={
        <>
          <ShellMetric label="Гравітон / ризики" value={`${graviton?.criticalSKU || 0} SKU`} tone="critical" />
          <ShellMetric label="Навантаження мережі" value={`${Math.round(graviton?.shopLoad || 0)} кг`} />
          <ShellMetric label="Піца / покриття" value={`${Math.round(pizza?.fill_index || 0)}%`} />
          <ShellMetric label="Кондитерка / покриття" value={`${Math.round(konditerka?.fill_index || 0)}%`} />
        </>
      }
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workshops.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.title} href={item.href} className="group rounded-3xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-700">
                    <Icon size={20} />
                  </div>
                  <div className={cn(
                    'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                    item.state === 'critical' && 'bg-red-100 text-red-700',
                    item.state === 'risk' && 'bg-amber-100 text-amber-700',
                    item.state === 'stable' && 'bg-emerald-100 text-emerald-700',
                    item.state === 'neutral' && 'bg-slate-200 text-slate-700'
                  )}>
                    {item.state === 'critical' ? 'критично' : item.state === 'risk' ? 'ризик' : item.state === 'stable' ? 'стабільно' : 'інфо'}
                  </div>
                </div>
                <div className="text-xl font-bold text-slate-950">{item.title}</div>
                <div className="mt-1 text-sm text-slate-600">{item.note}</div>
                <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <span className="text-xs text-slate-500">{item.metric}</span>
                  <ChevronRight className="text-slate-400 transition group-hover:translate-x-0.5" size={18} />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </RoleShell>
  );
}
