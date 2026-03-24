'use client';

import useSWR from 'swr';
import { ListTodo, AlertTriangle, PackageCheck, Clock3 } from 'lucide-react';
import { authedFetcher } from '@/lib/authed-fetcher';
import { InfoCard, RoleShell, ShellMetric, ShellNavCard } from '@/components/role-shell';

const fetcher = authedFetcher;

type MetricsResponse = {
  criticalSKU?: number;
  shopLoad?: number;
};

export default function ProductionChiefPage() {
  const { data: graviton } = useSWR<MetricsResponse>('/api/graviton/metrics', fetcher, { refreshInterval: 30000 });

  return (
    <RoleShell
      badge="Контур зміни"
      title="Контур начальника виробництва"
      description="Робочий екран зміни: черга, пріоритети, блокери й готовність до відвантаження без зайвого аналітичного шуму."
      accent="amber"
      metrics={
        <>
          <ShellMetric label="До випуску" value={`${Math.round(graviton?.shopLoad || 0)} кг`} />
          <ShellMetric label="Ризики" value={`${graviton?.criticalSKU || 0} SKU`} />
          <ShellMetric label="Режим" value="Зміна" />
          <ShellMetric label="Фокус" value="Виконання" />
        </>
      }
    >
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-xl font-bold">Що має бути в центрі екрана</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoCard title="Черга на зміну" note="Що запускати першим, який обсяг і в якому порядку" icon={ListTodo} />
            <InfoCard title="Блокери" note="Матеріали, стоп-фактори, завислі позиції" icon={AlertTriangle} />
            <InfoCard title="Готовність" note="Що вже виконано, що в роботі, що затримано" icon={PackageCheck} />
            <InfoCard title="Термін у межах зміни" note="Що має бути готове до кінця зміни / відвантаження" icon={Clock3} />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-xl font-bold">Переходи</h2>
          <div className="mt-4 space-y-3">
            <ShellNavCard href="/production" title="Робочий виробничий модуль" note="Чинний контур виконання" />
            <ShellNavCard href="/workshops" title="Цехи" note="Єдиний вхід у цехи та напрями" />
            <ShellNavCard href="/graviton" title="Мережа / дефіцити" note="Зрозуміти, що саме тягне план" />
            <ShellNavCard href="/pizza/production" title="Цехові екрани виробництва" note="Деталізація за напрямами" />
          </div>
        </div>
      </section>
    </RoleShell>
  );
}
