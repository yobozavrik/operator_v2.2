'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Briefcase,
  ChevronRight,
  Factory,
  FlaskConical,
  Landmark,
  Megaphone,
  Network,
  ShieldAlert,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authedFetcher } from '@/lib/authed-fetcher';
import { chakra, jetbrains } from '@/lib/fonts';
import type { MetricsResponse, SummaryResponse } from '@/lib/dashboard-data';

const fetcher = authedFetcher;

const UI = {
  badge: 'Рольовий центр керування',
  title: 'Виробничий центр',
  description:
    'Головний вхід в ERP: спочатку роль і управлінський контекст, потім цех, аналітика та дії.',
  roleSection: 'Робочі входи за ролями',
  roleSectionNote:
    'Основні режими для управління мережею, виробництвом та функціями підтримки.',
  workshopSection: 'Стан мережі та цехів',
  workshopNote:
    'Цехи залишаються рівнем деталізації, а не головним входом у систему.',
  quickSection: 'Швидкі переходи',
  quickNote:
    'Сервісні та спеціалізовані модулі.',
};

interface DashboardOverviewProps {
  initialData: {
    graviton: MetricsResponse;
    pizza: SummaryResponse;
    konditerka: SummaryResponse;
    bulvar: SummaryResponse;
    sadova: MetricsResponse;
  };
}

export default function DashboardOverview({ initialData }: DashboardOverviewProps) {
  // GRAVITON: 300s (5m) polling as requested
  const { data: graviton } = useSWR<MetricsResponse>('/api/graviton/metrics', fetcher, {
    refreshInterval: 300000,
    fallbackData: initialData.graviton,
  });

  // SUMMARIES: 600s (10m) polling as requested
  const { data: pizza } = useSWR<SummaryResponse>('/api/pizza/summary', fetcher, {
    refreshInterval: 600000,
    fallbackData: initialData.pizza,
  });

  const { data: konditerka } = useSWR<SummaryResponse>('/api/konditerka/summary', fetcher, {
    refreshInterval: 600000,
    fallbackData: initialData.konditerka,
  });

  const { data: bulvar } = useSWR<SummaryResponse>('/api/bulvar/summary', fetcher, {
    refreshInterval: 600000,
    fallbackData: initialData.bulvar,
  });

  const { data: sadova } = useSWR<MetricsResponse>('/api/sadova/metrics', fetcher, {
    refreshInterval: 600000,
    fallbackData: initialData.sadova,
  });

  const workshops = [
    {
      name: 'Гравітон',
      href: '/graviton',
      status: (graviton?.criticalSKU || 0) > 0 ? 'critical' : 'stable',
      note: `${graviton?.criticalSKU || 0} критичних позицій`,
    },
    {
      name: 'Піца',
      href: '/pizza',
      status: (pizza?.fill_index || 0) >= 100 ? 'stable' : 'risk',
      note: `Рівень покриття ${Math.round(pizza?.fill_index || 0)}%`,
    },
    {
      name: 'Кондитерка',
      href: '/konditerka',
      status: (konditerka?.fill_index || 0) >= 100 ? 'stable' : 'risk',
      note: `Рівень покриття ${Math.round(konditerka?.fill_index || 0)}%`,
    },
    {
      name: 'Бульвар',
      href: '/bulvar',
      status: (bulvar?.fill_index || 0) >= 100 ? 'stable' : 'risk',
      note: `Рівень покриття ${Math.round(bulvar?.fill_index || 0)}%`,
    },
    {
      name: 'Садова',
      href: '/sadova',
      status: 'stable',
      note: sadova?.totalSKU 
        ? `${sadova.totalSKU} позицій розподілу` 
        : 'Виробничий контур',
    },
  ];

  const criticalItems = [
    {
      title: 'Дефіцити мережі',
      value: `${graviton?.criticalSKU || 0} поз.`,
      note: 'Ключовий сигнал для операційного рішення',
      tone: (graviton?.criticalSKU || 0) > 0 ? 'critical' : 'stable',
    },
    {
      title: 'Навантаження виробництва',
      value: `${Math.round(graviton?.shopLoad || 0)} кг`,
      note: 'Поточний обсяг до випуску / переробки',
      tone: 'neutral',
    },
    {
      title: 'Прогноз і сценарії',
      value: 'ML-модуль',
      note: 'Доступний сценарійний аналіз і планування',
      tone: 'neutral',
    },
  ];

  const roles = [
    {
      href: '/owner',
      icon: Briefcase,
      title: 'Власник',
      subtitle: 'Контур власника',
      bullets: [
        'План / факт і фінансове здоров’я',
        'Ризики по мережі та цехах',
        'Прогноз, сценарії, продуктивність',
      ],
      accent: 'emerald' as const,
    },
    {
      href: '/ops',
      icon: ShieldAlert,
      title: 'Операційний директор',
      subtitle: 'Операційний контур',
      bullets: [
        'Критичні відхилення сьогодні',
        'Дефіцити й вузькі місця',
        'Рішення по мережі та цехах',
      ],
      accent: 'blue' as const,
      inDevelopment: true,
    },
    {
      href: '/production-chief',
      icon: Factory,
      title: 'Начальник виробництва',
      subtitle: 'Контур зміни',
      bullets: [
        'Черга на зміну та пріоритети',
        'Блокери й готовність',
        'Швидкий перехід до виконання',
      ],
      accent: 'amber' as const,
    },
    {
      href: '/supply-chief',
      icon: Truck,
      title: 'Начальник постачання',
      subtitle: 'Логістичний контур',
      bullets: [
        'Керування закупівлями сировини',
        'Моніторинг залишків на складах',
        'Оптимізація логістичних ланцюгів',
      ],
      accent: 'blue' as const,
    },
    {
      href: '/hr',
      icon: Users,
      title: 'Відділ кадрів',
      subtitle: 'Персонал та KPI',
      bullets: [
        'Управління графіками змін',
        'Облік робочого часу та KPI',
        'Найм та адаптація персоналу',
      ],
      accent: 'emerald' as const,
    },
    {
      href: '/finance',
      icon: Landmark,
      title: 'Фінансовий директор',
      subtitle: 'Фінансовий контур',
      bullets: [
        'Аналіз собівартості та маржі',
        'Контроль операційних витрат',
        'Фінансове планування',
      ],
      accent: 'amber' as const,
    },
    {
      href: '/marketing',
      icon: Megaphone,
      title: 'Маркетинг',
      subtitle: 'Комерційний контур',
      bullets: [
        'Аналіз споживчого попиту',
        'Управління програмами лояльності',
        'Координація запусків продуктів',
      ],
      accent: 'blue' as const,
      inDevelopment: true,
    },
    {
      href: '/technologist',
      icon: FlaskConical,
      title: 'Головний технолог',
      subtitle: 'Якість та рецептури',
      bullets: [
        'Розробка нових рецептур',
        'Контроль якості продукції',
        'Стандартизація техпроцесів',
      ],
      accent: 'emerald' as const,
      inDevelopment: true,
    },
  ];

  const quickLinks = [
    {
      href: '/finance',
      icon: Wallet,
      title: 'Фінанси',
      note: 'Маржа, виторг, відхилення',
    },
    {
      href: '/forecasting',
      icon: BrainCircuit,
      title: 'Прогнозування',
      note: 'ML-сценарії та планування',
    },
    {
      href: '/production',
      icon: AlertTriangle,
      title: 'Виробничий контур',
      note: 'Черга, пріоритети, дії',
    },
    {
      href: '/bakery',
      icon: BarChart3,
      title: 'Пекарня / аналітика',
      note: 'Окремий аналітичний модуль',
    },
  ];

  return (
    <div
      className={cn(
        'min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc,_#eef4ff_45%,_#f8fafc)] text-slate-900',
        chakra.variable,
        jetbrains.variable,
        'font-[family-name:var(--font-chakra)]',
      )}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-6 md:px-8 md:py-8">
        <header className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-blue-700 font-[family-name:var(--font-jetbrains)]">
                <Network size={14} />
                {UI.badge}
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-5xl">
                {UI.title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                {UI.description}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[560px]">
              {criticalItems.map((item) => (
                <div
                  key={item.title}
                  className={cn(
                    'rounded-2xl border p-4',
                    item.tone === 'critical' && 'border-red-200 bg-red-50',
                    item.tone === 'stable' && 'border-emerald-200 bg-emerald-50',
                    item.tone === 'neutral' && 'border-slate-200 bg-slate-50',
                  )}
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 font-[family-name:var(--font-jetbrains)]">
                    {item.title}
                  </div>
                  <div className="mt-2 text-2xl font-bold text-slate-950">{item.value}</div>
                  <div className="mt-1 text-xs text-slate-600">{item.note}</div>
                </div>
              ))}
            </div>
          </div>
        </header>

        <section className="mb-8">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-950 md:text-2xl">{UI.roleSection}</h2>
            <p className="mt-1 text-sm text-slate-600">{UI.roleSectionNote}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {roles.map((role) => (
              <RoleCard key={role.title} {...role} />
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="mb-5 flex items-center gap-3">
              <BarChart3 className="text-blue-600" size={20} />
              <div>
                <h3 className="text-lg font-bold text-slate-950">{UI.workshopSection}</h3>
                <p className="text-sm text-slate-600">{UI.workshopNote}</p>
              </div>
            </div>

            <div className="space-y-3">
              {workshops.map((workshop) => (
                <Link
                  key={workshop.name}
                  href={workshop.href}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-slate-300 hover:bg-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'h-2.5 w-2.5 rounded-full',
                        workshop.status === 'critical' && 'bg-red-500',
                        workshop.status === 'risk' && 'bg-amber-500',
                        workshop.status === 'stable' && 'bg-emerald-500',
                      )}
                    />
                    <div>
                      <div className="font-semibold text-slate-900">{workshop.name}</div>
                      <div className="text-xs text-slate-600">{workshop.note}</div>
                    </div>
                  </div>
                  <ChevronRight className="text-slate-400" size={18} />
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="mb-5 flex items-center gap-3">
              <BrainCircuit className="text-emerald-600" size={20} />
              <div>
                <h3 className="text-lg font-bold text-slate-950">{UI.quickSection}</h3>
                <p className="text-sm text-slate-600">{UI.quickNote}</p>
              </div>
            </div>

            <div className="space-y-3">
              {quickLinks.map((link) => (
                <QuickLink key={link.title} {...link} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function RoleCard({
  href,
  icon: Icon,
  title,
  subtitle,
  bullets,
  accent,
  inDevelopment = false,
}: {
  href: string;
  icon: any;
  title: string;
  subtitle: string;
  bullets: string[];
  accent: 'emerald' | 'blue' | 'amber';
  inDevelopment?: boolean;
}) {
  const accentClass = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
  }[accent];

  const cardClass = cn(
    'group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition',
    inDevelopment
      ? 'cursor-not-allowed'
      : 'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
  );

  const content = (
    <>
      {inDevelopment && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
          <div className="rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-center">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">В розробці</div>
          </div>
        </div>
      )}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className={cn('rounded-2xl border p-3', accentClass)}>
          <Icon size={22} />
        </div>
        <ArrowRight className={cn('text-slate-300 transition', !inDevelopment && 'group-hover:translate-x-0.5 group-hover:text-slate-500')} />
      </div>

      <div className="text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{subtitle}</div>
      <div className="mt-2 text-center text-xl font-bold text-slate-950">{title}</div>

      <ul className="mt-4 space-y-2">
        {bullets.map((bullet) => (
          <li key={bullet} className="text-sm leading-6 text-slate-600">
            {bullet}
          </li>
        ))}
      </ul>
    </>
  );

  if (inDevelopment) {
    return (
      <div className={cardClass} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className={cardClass}>
      {content}
    </Link>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  note,
}: {
  href: string;
  icon: any;
  title: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-slate-300 hover:bg-slate-100"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700">
          <Icon size={18} />
        </div>
        <div>
          <div className="font-semibold text-slate-950">{title}</div>
          <div className="text-xs text-slate-600">{note}</div>
        </div>
      </div>
      <ChevronRight size={18} className="text-slate-400" />
    </Link>
  );
}
