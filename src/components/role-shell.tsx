'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home, Layers3, Briefcase, ShieldAlert, Factory } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

const topNav = [
  { href: '/', label: 'Головна', icon: Home },
  { href: '/owner', label: 'Власник', icon: Briefcase },
  { href: '/ops', label: 'Операційний контур', icon: ShieldAlert },
  { href: '/production-chief', label: 'Виробництво', icon: Factory },
  { href: '/workshops', label: 'Цехи', icon: Layers3 },
];

export function RoleShell({
  badge,
  title,
  description,
  metrics,
  accent = 'blue',
  children,
}: {
  badge: string;
  title: string;
  description: string;
  metrics?: ReactNode;
  accent?: 'emerald' | 'blue' | 'amber';
  children: ReactNode;
}) {
  const pathname = usePathname();

  const accentClass = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
  }[accent];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">
                Рольова архітектура / етап 2
              </div>
              <nav className="flex flex-wrap items-center gap-2">
                {topNav.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition',
                        active
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                      )}
                    >
                      <Icon size={14} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <Link href="/" className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
              Повернутися до рольового входу
              <ChevronRight size={16} />
            </Link>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className={cn('mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]', accentClass)}>
                {badge}
              </div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
            </div>
            {metrics ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{metrics}</div> : null}
          </div>
        </section>

        {children}
      </div>
    </main>
  );
}

export function ShellMetric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'critical' }) {
  return (
    <div className={cn('rounded-2xl border p-4', tone === 'critical' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50')}>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
    </div>
  );
}

export function InfoCard({ title, note, icon: Icon }: { title: string; note: string; icon: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="mb-3 inline-flex rounded-xl border border-slate-200 bg-white p-2 text-slate-700">
        <Icon size={18} />
      </div>
      <div className="font-semibold text-slate-950">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{note}</div>
    </div>
  );
}

export function ShellNavCard({ href, title, note }: { href: string; title: string; note: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-slate-300 hover:bg-slate-100">
      <div>
        <div className="font-semibold text-slate-950">{title}</div>
        <div className="text-xs text-slate-600">{note}</div>
      </div>
      <ChevronRight size={18} className="text-slate-400" />
    </Link>
  );
}
