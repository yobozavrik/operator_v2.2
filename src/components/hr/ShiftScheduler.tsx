'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Save,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type StoreId = 'ruska' | 'kvartz' | 'rosha' | 'entuz' | 'prospect' | 'graviton' | 'packaging';
type EmpId = string;

interface Employee {
  id: EmpId;
  name: string;
  initials: string;
  role: string;
  homeStore: StoreId;
  color: string;
  payRate: number;
}

interface Store {
  id: StoreId;
  shortName: string;
  type: 'shop' | 'workshop';
  norm: number;
  color: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const STORES: Store[] = [
  { id: 'ruska',     shortName: 'Руська',     type: 'shop',     norm: 2, color: '#6366f1' },
  { id: 'kvartz',    shortName: 'Кварц',      type: 'shop',     norm: 2, color: '#0891b2' },
  { id: 'rosha',     shortName: 'Роша',       type: 'shop',     norm: 2, color: '#7c3aed' },
  { id: 'entuz',     shortName: 'Ентузіаст',  type: 'shop',     norm: 2, color: '#b45309' },
  { id: 'prospect',  shortName: 'Проспект',   type: 'shop',     norm: 2, color: '#0f766e' },
  { id: 'graviton',  shortName: 'Гравітон',   type: 'workshop', norm: 5, color: '#dc2626' },
  { id: 'packaging', shortName: 'Пакування',  type: 'workshop', norm: 3, color: '#ea580c' },
];

const EMPLOYEES: Employee[] = [
  { id: 'OG', name: 'Оксана Гончар',      initials: 'ОГ', role: 'Ст. продавець', homeStore: 'ruska',     color: '#6366f1', payRate: 650 },
  { id: 'MG', name: 'Марія Гаврилюк',    initials: 'МГ', role: 'Продавець',     homeStore: 'ruska',     color: '#818cf8', payRate: 550 },
  { id: 'NK', name: 'Наталія Костюк',    initials: 'НК', role: 'Продавець',     homeStore: 'kvartz',    color: '#0891b2', payRate: 550 },
  { id: 'RB', name: 'Роман Бойко',       initials: 'РБ', role: 'Продавець',     homeStore: 'kvartz',    color: '#22d3ee', payRate: 550 },
  { id: 'TS', name: 'Тетяна Шевчук',    initials: 'ТШ', role: 'Продавець',     homeStore: 'rosha',     color: '#7c3aed', payRate: 550 },
  { id: 'AM', name: 'Андрій Мельник',    initials: 'АМ', role: 'Ст. продавець', homeStore: 'entuz',     color: '#b45309', payRate: 650 },
  { id: 'LV', name: 'Людмила Власова',   initials: 'ЛВ', role: 'Продавець',     homeStore: 'entuz',     color: '#d97706', payRate: 550 },
  { id: 'KP', name: 'Катерина Петренко', initials: 'КП', role: 'Продавець',     homeStore: 'prospect',  color: '#0f766e', payRate: 550 },
  { id: 'IP', name: 'Іван Паламарчук',   initials: 'ІП', role: 'Ліпник',        homeStore: 'graviton',  color: '#dc2626', payRate: 480 },
  { id: 'SM', name: 'Спіжарська М.',     initials: 'СМ', role: 'Ст. зміни',     homeStore: 'graviton',  color: '#ef4444', payRate: 700 },
  { id: 'OT', name: 'Олег Тимчук',      initials: 'ОТ', role: 'Пакувальник',   homeStore: 'packaging', color: '#ea580c', payRate: 430 },
  { id: 'YK', name: 'Юрій Клим',        initials: 'ЮК', role: 'Ліпник',        homeStore: 'graviton',  color: '#f87171', payRate: 480 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS_IN_MONTH = 31;
const MARCH_START_DOW = 6; // 1 Mar 2026 = Sunday
const DAY_NAMES = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const VISIBLE = 14;

function getDow(day: number) { return (MARCH_START_DOW + day - 1) % 7; }
function isWeekend(day: number) { const d = getDow(day); return d === 0 || d === 6; }

function buildInitialCells(): Record<string, EmpId[]> {
  const cells: Record<string, EmpId[]> = {};
  const patterns: Record<EmpId, number[]> = {
    OG: [17,18,21,22,25,26,29,30], MG: [19,20,23,24,27,28,31],
    NK: [17,18,21,22,25,26],       RB: [19,20,23,24,27,28],
    TS: [18,19,22,23,26,27],       AM: [17,18,21,22,25,26],
    LV: [19,20,23,24,27,28],       KP: [17,18,21,22,25,26,29,30],
    IP: [17,18,19,21,22,23,25,26], SM: [19,20,21,23,24,25,27,28],
    OT: [17,18,21,22,25,26],       YK: [],
  };
  const empHome: Record<EmpId, StoreId> = {
    OG:'ruska', MG:'ruska', NK:'kvartz', RB:'kvartz', TS:'rosha',
    AM:'entuz', LV:'entuz', KP:'prospect', IP:'graviton', SM:'graviton',
    OT:'packaging', YK:'graviton',
  };
  for (const [id, days] of Object.entries(patterns)) {
    for (const day of days) {
      const key = `${empHome[id]}-${day}`;
      if (!cells[key]) cells[key] = [];
      cells[key].push(id);
    }
  }
  return cells;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ShiftScheduler() {
  const [cells, setCells] = useState<Record<string, EmpId[]>>(buildInitialCells);
  const [dragEmp, setDragEmp] = useState<EmpId | null>(null);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [startDay, setStartDay] = useState(17);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const visibleDays = Array.from({ length: VISIBLE }, (_, i) => startDay + i).filter(d => d <= DAYS_IN_MONTH);

  function getEmp(id: EmpId) { return EMPLOYEES.find(e => e.id === id)!; }
  function getStore(id: StoreId) { return STORES.find(s => s.id === id)!; }

  function getBench(): EmpId[] {
    const assigned = new Set<EmpId>();
    for (const s of STORES) {
      for (const d of visibleDays) {
        (cells[`${s.id}-${d}`] ?? []).forEach(e => assigned.add(e));
      }
    }
    return EMPLOYEES.filter(e => !assigned.has(e.id)).map(e => e.id);
  }

  function handleDragStart(empId: EmpId, from: string) {
    setDragEmp(empId);
    setDragFrom(from);
  }

  function handleDrop(toKey: string) {
    if (!dragEmp || toKey === dragFrom) { setDragEmp(null); setDragFrom(null); return; }
    setCells(prev => {
      const next = { ...prev };
      if (dragFrom && dragFrom !== 'bench') {
        next[dragFrom] = (next[dragFrom] ?? []).filter(e => e !== dragEmp);
      }
      if (!next[toKey]) next[toKey] = [];
      if (!next[toKey].includes(dragEmp)) next[toKey] = [...next[toKey], dragEmp];
      return next;
    });
    setSaved(false);
    setDragEmp(null);
    setDragFrom(null);
  }

  function removeFromCell(empId: EmpId, key: string) {
    setCells(prev => ({ ...prev, [key]: (prev[key] ?? []).filter(e => e !== empId) }));
    setSaved(false);
  }

  function getPayroll() {
    return EMPLOYEES.map(emp => {
      let home = 0, sub = 0;
      const subLocs: string[] = [];
      for (const s of STORES) {
        for (let d = 1; d <= DAYS_IN_MONTH; d++) {
          if ((cells[`${s.id}-${d}`] ?? []).includes(emp.id)) {
            if (s.id === emp.homeStore) home++;
            else { sub++; subLocs.push(s.shortName); }
          }
        }
      }
      return { emp, home, sub, subLocs: [...new Set(subLocs)], total: (home + sub) * emp.payRate };
    }).filter(r => r.home + r.sub > 0);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(219,234,254,0.5),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef4fb_100%)] px-4 py-6 text-slate-900 md:px-6">
      <div className="mx-auto max-w-[1600px] space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/hr" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300">
              <ArrowLeft size={15} /> HR
            </Link>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Відділ кадрів</div>
              <h1 className="text-2xl font-bold text-slate-950">Графік змін — Березень 2026</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Day window nav */}
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <button
                onClick={() => setStartDay(d => Math.max(1, d - 7))}
                disabled={startDay <= 1}
                className="rounded-full p-1 hover:bg-slate-100 disabled:opacity-30"
              ><ChevronLeft size={16} /></button>
              <span className="min-w-[90px] text-center text-sm font-medium text-slate-700">
                {startDay}–{Math.min(startDay + VISIBLE - 1, DAYS_IN_MONTH)} бер
              </span>
              <button
                onClick={() => setStartDay(d => Math.min(DAYS_IN_MONTH - VISIBLE + 1, d + 7))}
                disabled={startDay + VISIBLE > DAYS_IN_MONTH}
                className="rounded-full p-1 hover:bg-slate-100 disabled:opacity-30"
              ><ChevronRight size={16} /></button>
            </div>

            <button
              onClick={() => setSaved(true)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition',
                saved
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'bg-slate-950 text-white shadow-[0_8px_20px_rgba(15,23,42,0.18)] hover:bg-slate-800'
              )}
            >
              {saved ? <><CheckCircle2 size={16} /> Збережено</> : <><Save size={16} /> Зафіксувати</>}
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3">
          <LegendChip color="bg-slate-200" label="Основна зміна" />
          <LegendChip color="bg-amber-300" label="Заміна (інша локація)" />
          <div className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
            <AlertTriangle size={12} /> Нестача персоналу
          </div>
        </div>

        {/* Grid + Sidebar */}
        <div className="flex gap-5">

          {/* Scheduling grid */}
          <div className="min-w-0 flex-1 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.07)]">

            {/* Column headers: days */}
            <div
              className="grid border-b border-slate-200 bg-slate-50"
              style={{ gridTemplateColumns: `200px repeat(${visibleDays.length}, minmax(64px, 1fr))` }}
            >
              <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Локація</div>
              {visibleDays.map(day => (
                <div key={day} className={cn('border-l border-slate-200 py-3 text-center', isWeekend(day) && 'bg-slate-100/70')}>
                  <div className={cn('text-[11px] font-bold', isWeekend(day) ? 'text-slate-400' : 'text-slate-500')}>
                    {DAY_NAMES[getDow(day)]}
                  </div>
                  <div className={cn('text-base font-bold', isWeekend(day) ? 'text-slate-400' : 'text-slate-900')}>
                    {day}
                  </div>
                </div>
              ))}
            </div>

            {/* Store rows */}
            {STORES.map(store => (
              <div
                key={store.id}
                className={cn(
                  'grid border-b border-slate-100 last:border-b-0',
                  store.type === 'workshop' && 'bg-slate-50/40'
                )}
                style={{ gridTemplateColumns: `200px repeat(${visibleDays.length}, minmax(64px, 1fr))` }}
              >
                {/* Store label */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: store.color }} />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{store.shortName}</div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <Users size={10} /> норма {store.norm}
                    </div>
                  </div>
                </div>

                {/* Day cells */}
                {visibleDays.map(day => {
                  const key = `${store.id}-${day}`;
                  const emps = cells[key] ?? [];
                  const understaffed = emps.length > 0 && emps.length < store.norm;
                  const empty = emps.length === 0 && !isWeekend(day);
                  const isOver = hoveredCell === key && dragEmp !== null;

                  return (
                    <div
                      key={key}
                      onDragOver={e => { e.preventDefault(); setHoveredCell(key); }}
                      onDragLeave={() => setHoveredCell(null)}
                      onDrop={() => { handleDrop(key); setHoveredCell(null); }}
                      className={cn(
                        'border-l border-slate-100 px-1.5 py-2 min-h-[68px] transition-colors',
                        isWeekend(day) && 'bg-slate-50/60',
                        empty && 'bg-red-50/25',
                        understaffed && 'bg-amber-50/40',
                        isOver && 'bg-blue-50 border-blue-200',
                      )}
                    >
                      <div className="flex flex-wrap gap-1">
                        {emps.map(empId => {
                          const emp = getEmp(empId);
                          return (
                            <EmpChip
                              key={empId}
                              emp={emp}
                              isSub={emp.homeStore !== store.id}
                              onDragStart={() => handleDragStart(empId, key)}
                              onRemove={() => removeFromCell(empId, key)}
                            />
                          );
                        })}
                        {understaffed && (
                          <span className="mt-0.5 flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            <AlertTriangle size={9} /> -{store.norm - emps.length}
                          </span>
                        )}
                        {isOver && (
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-dashed border-blue-400 text-blue-400 text-sm">+</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Sidebar */}
          <div className="flex w-[200px] shrink-0 flex-col gap-4">

            {/* Bench */}
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Users size={15} className="text-slate-500" /> Не в графіку
              </div>
              {getBench().length === 0
                ? <p className="py-3 text-center text-xs text-slate-400">Всі розставлені</p>
                : getBench().map(id => <BenchCard key={id} emp={getEmp(id)} onDragStart={() => handleDragStart(id, 'bench')} />)
              }
            </div>

            {/* Full roster */}
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <GripVertical size={15} className="text-slate-500" /> Всі
              </div>
              <div className="space-y-1">
                {EMPLOYEES.map(emp => (
                  <div
                    key={emp.id}
                    draggable
                    onDragStart={() => handleDragStart(emp.id, 'bench')}
                    className="flex cursor-grab items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50 active:cursor-grabbing"
                  >
                    <div
                      className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ backgroundColor: emp.color }}
                    >{emp.initials[0]}</div>
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-medium text-slate-900">
                        {emp.name.split(' ')[0]} {emp.name.split(' ')[1]?.[0]}.
                      </div>
                      <div className="truncate text-[10px] text-slate-500">{getStore(emp.homeStore).shortName}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Payroll preview */}
        {saved && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <CheckCircle2 size={18} className="text-emerald-600" />
              <h3 className="font-semibold text-slate-950">Попередній розрахунок ЗП — Березень 2026</h3>
              <span className="ml-auto text-xs text-slate-500">до підтвердження керівником</span>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-emerald-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-emerald-100 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-4 py-3 text-left">Працівник</th>
                    <th className="px-4 py-3 text-left">Посада</th>
                    <th className="px-4 py-3 text-center">Осн. зміни</th>
                    <th className="px-4 py-3 text-center">Заміни</th>
                    <th className="px-4 py-3 text-left">Де замінював</th>
                    <th className="px-4 py-3 text-right">Нараховано</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {getPayroll().map(({ emp, home, sub, subLocs, total }) => (
                    <tr key={emp.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{emp.name}</td>
                      <td className="px-4 py-3 text-slate-600">{emp.role}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{home}</td>
                      <td className="px-4 py-3 text-center">
                        {sub > 0
                          ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{sub}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{subLocs.length > 0 ? subLocs.join(', ') : <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">{total.toLocaleString('uk-UA')} ₴</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-emerald-200 bg-emerald-50">
                    <td colSpan={5} className="px-4 py-3 font-semibold text-slate-900">Всього</td>
                    <td className="px-4 py-3 text-right text-base font-bold text-slate-950">
                      {getPayroll().reduce((s, r) => s + r.total, 0).toLocaleString('uk-UA')} ₴
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmpChip({ emp, isSub, onDragStart, onRemove }: {
  emp: Employee; isSub: boolean;
  onDragStart: () => void; onRemove: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${emp.name}${isSub ? ' · ЗАМІНА' : ''}`}
      className={cn(
        'flex cursor-grab items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold select-none active:cursor-grabbing',
        isSub ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
      )}
    >
      <div className="h-3.5 w-3.5 shrink-0 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ backgroundColor: emp.color }}>
        {emp.initials[0]}
      </div>
      {emp.initials}
      {isSub && <span className="text-[9px] text-amber-600">↔</span>}
      {hover && (
        <button onClick={e => { e.stopPropagation(); onRemove(); }} className="text-slate-400 hover:text-red-500">
          <X size={10} />
        </button>
      )}
    </div>
  );
}

function BenchCard({ emp, onDragStart }: { emp: Employee; onDragStart: () => void }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex cursor-grab items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 active:cursor-grabbing hover:border-slate-300 hover:bg-white transition mb-2"
    >
      <GripVertical size={12} className="shrink-0 text-slate-400" />
      <div className="h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: emp.color }}>
        {emp.initials}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-slate-900">{emp.name.split(' ')[0]}</div>
        <div className="truncate text-[10px] text-slate-500">{emp.role}</div>
      </div>
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
      <span className={cn('h-3 w-3 rounded-full', color)} /> {label}
    </div>
  );
}
