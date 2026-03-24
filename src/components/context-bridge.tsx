'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ContextBridge({
  role,
  area,
  workshop,
  links,
  tone = 'blue',
  className,
}: {
  role: string;
  area: string;
  workshop?: string;
  links: { href: string; label: string }[];
  tone?: 'blue' | 'emerald' | 'amber';
  className?: string;
}) {
  const toneClass = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
  }[tone];

  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white p-4 shadow-sm', className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className={cn('mb-2 inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]', toneClass)}>
            {role}
          </div>
          <div className="text-lg font-bold text-slate-950">{area}</div>
          <div className="text-sm text-slate-600">
            {workshop ? <>Цех: <span className="font-semibold text-slate-800">{workshop}</span></> : 'Модуль підключено до нової рольової архітектури'}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <Link
              key={link.href + link.label}
              href={link.href}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
            >
              {link.label}
              <ChevronRight size={14} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
