'use client';

import useSWR from 'swr';
import { AlertTriangle, Factory, Network, Truck } from 'lucide-react';
import { authedFetcher } from '@/lib/authed-fetcher';
import { InfoCard, RoleShell, ShellMetric, ShellNavCard } from '@/components/role-shell';

const fetcher = authedFetcher;

type MetricsResponse = {
  criticalSKU?: number;
  shopLoad?: number;
};

export default function OpsPage() {
  const { data: graviton } = useSWR<MetricsResponse>('/api/graviton/metrics', fetcher, { refreshInterval: 30000 });

  return (
    <RoleShell
      badge="Операційний контур"
      title="Контур операційного директора"
      description="Панель відхилень і дій: де система ламається сьогодні, що впливає на випуск і де потрібне втручання."
      accent="blue"
      metrics={
        <>
          <ShellMetric label="Критичні SKU" value={`${graviton?.criticalSKU || 0}`} tone="critical" />
          <ShellMetric label="До випуску" value={`${Math.round(graviton?.shopLoad || 0)} кг`} />
          <ShellMetric label="Контур" value="Сьогодні / наживо" />
          <ShellMetric label="Пріоритет" value="Відхилення" />
        </>
      }
    >
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-xl font-bold">Що потрібно бачити одразу</h2>
          <div className="mt-5 space-y-4">
            <InfoCard title="Критичні відхилення" note="Що впливає на SLA, випуск і наявність товару прямо сьогодні" icon={AlertTriangle} />
            <InfoCard title="Вузькі місця по цехах" note="Яка потужність перевантажена або просаджена" icon={Factory} />
            <InfoCard title="Розподіл і доставка" note="Де потрібен ручний пріоритет або перерозподіл" icon={Truck} />
            <InfoCard title="Сигнал → причина → дія" note="Кожен alert має приводити до наступного кроку, а не лише до перегляду" icon={Network} />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-xl font-bold">Переходи</h2>
          <div className="mt-4 space-y-3">
            <ShellNavCard href="/workshops" title="Цехи" note="Єдиний шар цехів і напрямів" />
            <ShellNavCard href="/graviton" title="Мережа / дефіцити" note="Головний оперативний рівень деталізації" />
            <ShellNavCard href="/production" title="Виробничий контур" note="Черга, статус, дії" />
            <ShellNavCard href="/forecasting" title="Прогнозування" note="Сценарії на найближчі дні" />
          </div>
        </div>
      </section>
    </RoleShell>
  );
}
