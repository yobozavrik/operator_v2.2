'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CalendarRange,
  Clock3,
  FileCheck2,
  IdCard,
  LayoutGrid,
  MapPinned,
  ShieldCheck,
  Shuffle,
  Users,
} from 'lucide-react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';

type TabId = 'overview' | 'structure' | 'attendance' | 'absences' | 'recruitment' | 'employee' | 'compliance';
type Tone = 'ok' | 'warning' | 'critical';

type TabItem = {
  id: TabId;
  label: string;
  icon: typeof LayoutGrid;
};

type MetricCard = {
  label: string;
  value: string;
  note: string;
  badge: string;
  tone: Tone;
};

const tabs: TabItem[] = [
  { id: 'overview', label: 'Огляд HR', icon: LayoutGrid },
  { id: 'structure', label: 'Структура штату', icon: MapPinned },
  { id: 'attendance', label: 'Відвідуваність', icon: Clock3 },
  { id: 'absences', label: 'Контроль відсутностей', icon: CalendarRange },
  { id: 'recruitment', label: 'Підбір персоналу', icon: Briefcase },
  { id: 'employee', label: 'Картка працівника 360', icon: IdCard },
  { id: 'compliance', label: 'Документи і контроль', icon: ShieldCheck },
];

const topMetrics: MetricCard[] = [
  {
    label: 'Всього працівників',
    value: '156',
    note: '110 виробництво + 46 продавців',
    badge: '+4 за 30 днів',
    tone: 'ok',
  },
  {
    label: 'Активних сьогодні',
    value: '147',
    note: '6 лікарняних, 3 відпустка',
    badge: '94.2% виходу',
    tone: 'ok',
  },
  {
    label: 'Відкритих вакансій',
    value: '11',
    note: '5 магазини, 6 цехи',
    badge: '2 критичні',
    tone: 'warning',
  },
  {
    label: 'Зміни під ризиком',
    value: '4',
    note: '2 магазини, 2 цехи',
    badge: '1 червоний ризик',
    tone: 'critical',
  },
];

const headcountData = [
  { month: 'Жов', staff: 144, hire: 8, exit: 5 },
  { month: 'Лис', staff: 146, hire: 7, exit: 5 },
  { month: 'Гру', staff: 149, hire: 9, exit: 6 },
  { month: 'Січ', staff: 151, hire: 6, exit: 4 },
  { month: 'Лют', staff: 154, hire: 8, exit: 5 },
  { month: 'Бер', staff: 156, hire: 7, exit: 5 },
];

const attendanceData = [
  { day: 'Пн', onShift: 148, late: 3, noShow: 1, replacement: 2 },
  { day: 'Вт', onShift: 150, late: 4, noShow: 0, replacement: 1 },
  { day: 'Ср', onShift: 147, late: 6, noShow: 2, replacement: 3 },
  { day: 'Чт', onShift: 149, late: 5, noShow: 1, replacement: 2 },
  { day: 'Пт', onShift: 151, late: 4, noShow: 1, replacement: 1 },
  { day: 'Сб', onShift: 145, late: 7, noShow: 2, replacement: 4 },
  { day: 'Нд', onShift: 144, late: 6, noShow: 1, replacement: 3 },
];

const absenceMix = [
  { name: 'Відпустки', value: 9, color: '#0f766e' },
  { name: 'Лікарняні', value: 6, color: '#2563eb' },
  { name: 'Відгули', value: 3, color: '#f59e0b' },
  { name: 'Прогули', value: 2, color: '#dc2626' },
];

const staffingHeatmap = [
  { location: 'Руська', type: 'Магазин', fill: '50%', tone: 'critical' as Tone },
  { location: 'Роша', type: 'Магазин', fill: '50%', tone: 'critical' as Tone },
  { location: 'Гравітон', type: 'Цех', fill: '83%', tone: 'warning' as Tone },
  { location: 'Пакування', type: 'Цех', fill: '83%', tone: 'warning' as Tone },
  { location: 'Кварц', type: 'Магазин', fill: '100%', tone: 'ok' as Tone },
  { location: 'Ентузіастів', type: 'Магазин', fill: '100%', tone: 'ok' as Tone },
  { location: 'Склад', type: 'Цех', fill: '100%', tone: 'ok' as Tone },
  { location: 'Проспект', type: 'Магазин', fill: '100%', tone: 'ok' as Tone },
];

const structureRows = [
  ['Магазин №12 Руська', 'Магазин', 'Продавець', '2', '1', '1', '50%'],
  ['Цех Гравітон', 'Цех', 'Ліпник', '12', '10', '2', '83%'],
  ['Цех Гравітон', 'Цех', 'Пакувальник', '6', '5', '1', '83%'],
  ['Магазин №3 Кварц', 'Магазин', 'Продавець', '2', '2', '0', '100%'],
  ['Магазин №8 Роша', 'Магазин', 'Продавець', '2', '1', '1', '50%'],
];

const absenceRows = [
  ['Іван Паламарчук', 'Цех Гравітон', 'Лікарняний', '12.03 - 18.03', 'Активний', 'Олександр Тимошук'],
  ['Марія Гаврилюк', 'Магазин №12 Руська', 'Відпустка', '20.03 - 27.03', 'Погоджено', 'Пошук резерву'],
  ['Наталія Костюк', 'Магазин №3 Кварц', 'Відгул', '16.03', 'На погодженні', 'Не визначено'],
  ['Олег Тимчук', 'Цех пакування', 'Лікарняний', '14.03 - 17.03', 'Очікує підтвердження', 'Внутрішня заміна'],
];

const recruitmentFunnel = [
  { stage: 'Відгук', count: 34 },
  { stage: 'Скринінг', count: 18 },
  { stage: 'Співбесіда', count: 12 },
  { stage: 'Пробна зміна', count: 8 },
  { stage: 'Офер', count: 5 },
  { stage: 'Вийшов', count: 4 },
  { stage: 'Пройшов ІС', count: 3 },
];

const vacancyRows = [
  ['Продавець', 'Магазин №12 Руська', '22 дні', '4', 'Пробна зміна'],
  ['Ліпник', 'Цех Гравітон', '14 днів', '6', 'Співбесіда'],
  ['Пакувальник', 'Цех Гравітон', '9 днів', '5', 'Скринінг'],
  ['Продавець', 'Магазин №8 Роша', '19 днів', '3', 'Телефонний скринінг'],
];

const complianceRows = [
  ['Медкнижки', '7', '2 критично', 'Виробництво / санітарія'],
  ['Інструктажі ОП', '4', '1 критично', 'Нові працівники'],
  ['Військовий облік', '3', '0 критично', 'Оновити дані'],
  ['Згода на ПД', '2', '0 критично', 'Перепідписати форму'],
];

const employeeDirectoryRows = [
  ['Оксана Гончар', 'Старший продавець', 'Магазин №5 Героїв Майдану', '2/2', 'Активний'],
  ['Іван Паламарчук', 'Ліпник', 'Цех Гравітон', '5/2', 'Лікарняний'],
  ['Марія Гаврилюк', 'Продавець', 'Магазин №12 Руська', '2/2', 'Відпустка'],
  ['Наталія Костюк', 'Продавець', 'Магазин №3 Кварц', '2/2', 'Активний'],
  ['Олег Тимчук', 'Пакувальник', 'Цех пакування', 'Змінний', 'Активний'],
  ['Андрій Мельник', 'Комірник', 'Склад', '5/2', 'Активний'],
];

const candidateListRows = [
  ['Тетяна Шевчук', 'Продавець', 'Магазин №8 Роша', 'Пробна зміна', 'Work.ua'],
  ['Юрій Клим', 'Ліпник', 'Цех Гравітон', 'Співбесіда', 'Telegram'],
  ['Олена Литвин', 'Пакувальник', 'Цех Гравітон', 'Скринінг', 'Рекомендація'],
  ['Роман Бойко', 'Продавець', 'Магазин №12 Руська', 'Офер', 'Rabota.ua'],
];

const riskSignals = [
  {
    title: 'Магазин №12 Руська',
    note: '1 продавець замість 2. Ризик незакритої вечірньої зміни.',
    tone: 'critical' as Tone,
  },
  {
    title: 'Цех Гравітон',
    note: 'По лепці 2 вакансії та 1 лікарняний. Потрібне рішення по резерву.',
    tone: 'warning' as Tone,
  },
  {
    title: 'Новачки без закритого онбордингу',
    note: '4 працівники не завершили чекліст 30-го дня.',
    tone: 'warning' as Tone,
  },
];

const weeklyFocus = [
  'Закрити вакансію продавця на Руській до кінця тижня',
  'Перевірити медкнижки 7 співробітників виробництва',
  'Завершити 30/60/90 review по 5 новачках',
  'Вирівняти графік відпусток на квітень по магазинах',
];

export default function HrPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const activeMeta = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(219,234,254,0.5),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef4fb_100%)] px-4 py-6 text-slate-900 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-white/80 bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(241,245,249,0.94))] p-6 shadow-[0_25px_80px_rgba(15,23,42,0.10)] md:p-8">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950">
              <ArrowLeft size={16} />
              Назад
            </button>
            <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950">
              <ArrowRight size={16} className="rotate-180" />
              Головне меню
            </Link>
          </div>
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700">
                <Users size={14} />
                Відділ кадрів
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 md:text-5xl">
                HR-модуль для мережі магазинів і виробництва
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                Управління чисельністю, покриттям змін, відсутностями, підбором, адаптацією, документами та карткою
                працівника в одному ERP-контурі.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {topMetrics.map((metric) => (
                <MetricTile key={metric.label} metric={metric} />
              ))}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ActionLink href="/hr/schedule" title="Графік змін" note="Розстановка по локаціях, заміни, фіксація" />
            <ActionLink href="/hr" title="Центр відсутностей" note="Відпустки, лікарняні, конфлікти графіка" />
            <ActionLink href="/hr" title="Підбір і адаптація" note="Воронка, пробні зміни, 30/60/90" />
            <ActionLink href="/hr" title="Картка працівника" note="Документи, фото, навички, заміни" />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur md:p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {['Період: березень 2026', 'Тип: всі локації', 'Статус: активні', 'Керівник: всі', 'Джерело найму: всі'].map((chip) => (
              <div key={chip} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                {chip}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.id === activeTab;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition',
                    isActive
                      ? 'border-slate-950 bg-slate-950 text-white shadow-[0_10px_25px_rgba(15,23,42,0.18)]'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  )}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)] md:p-8">
            <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Активний екран</div>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">{activeMeta.label}</h2>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Режим</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">Прототип ERP</div>
              </div>
            </div>

            {activeTab === 'overview' ? <OverviewTab /> : null}
            {activeTab === 'structure' ? <StructureTab /> : null}
            {activeTab === 'attendance' ? <AttendanceTab /> : null}
            {activeTab === 'absences' ? <AbsencesTab /> : null}
            {activeTab === 'recruitment' ? <RecruitmentTab /> : null}
            {activeTab === 'employee' ? <EmployeeTab /> : null}
            {activeTab === 'compliance' ? <ComplianceTab /> : null}
          </div>

          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <SidebarPanel title="Сигнали дня" icon={AlertTriangle}>
              {riskSignals.map((signal) => (
                <SignalRow key={signal.title} title={signal.title} note={signal.note} tone={signal.tone} compact />
              ))}
            </SidebarPanel>

            <SidebarPanel title="Фокус HR на тиждень" icon={BadgeCheck}>
              {weeklyFocus.map((item) => (
                <ChecklistRow key={item} text={item} />
              ))}
            </SidebarPanel>
          </aside>
        </section>
      </div>
    </main>
  );
}

function OverviewTab() {
  const summaryCards = [
    ['Текучість', '8.4%', 'Нижче попереднього кварталу'],
    ['Час закриття вакансії', '16 днів', 'Проблема по продавцях і пакувальниках'],
    ['Закриття змін', '96.8%', 'Неаварійне покриття змін'],
    ['Адаптація 30/60/90', '82%', 'Є новачки без закритого чекліста'],
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(([title, value, note]) => (
          <SmallKpi key={title} title={title} value={value} note={note} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <ChartPanel title="Чисельність і рух штату" subtitle="Активна чисельність, найм і звільнення по місяцях">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={headcountData}>
              <defs>
                <linearGradient id="staffFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0f766e" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Bar dataKey="hire" name="Найм" fill="#93c5fd" radius={[8, 8, 0, 0]} barSize={18} />
              <Bar dataKey="exit" name="Звільнення" fill="#fca5a5" radius={[8, 8, 0, 0]} barSize={18} />
              <Area type="monotone" dataKey="staff" name="Активний штат" stroke="#0f766e" fill="url(#staffFill)" strokeWidth={3} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Структура відсутностей" subtitle="Поточний розподіл відпусток, лікарняних і прогулів">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={absenceMix} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                {absenceMix.map((item) => (
                  <Cell key={item.name} fill={item.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-3">
            {absenceMix.map((item) => (
              <div key={item.name} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-950">{item.value}</div>
              </div>
            ))}
          </div>
        </ChartPanel>
      </div>
    </div>
  );
}

function StructureTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SmallKpi title="Магазини у дефіциті" value="3" note="Критичний дефіцит продавців" />
        <SmallKpi title="Цехи у дефіциті" value="2" note="Ліпка та пакування" />
        <SmallKpi title="Укомплектованість" value="91%" note="По всій мережі" />
      </div>

      <ChartPanel title="Карта укомплектованості" subtitle="Локації з найбільшим кадровим ризиком">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {staffingHeatmap.map((cell) => (
            <div
              key={`${cell.location}-${cell.type}`}
              className={cn(
                'rounded-3xl border p-4 text-center transition',
                cell.tone === 'critical' && 'border-red-200 bg-red-50',
                cell.tone === 'warning' && 'border-amber-200 bg-amber-50',
                cell.tone === 'ok' && 'border-emerald-200 bg-emerald-50'
              )}
            >
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{cell.type}</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">{cell.location}</div>
              <div className="mt-3 text-3xl font-bold text-slate-950">{cell.fill}</div>
            </div>
          ))}
        </div>
      </ChartPanel>

      <SimpleTable headers={['Локація', 'Тип', 'Посада', 'Штат', 'Факт', 'Нестача', 'Укомпл.']} rows={structureRows} />
    </div>
  );
}

function AttendanceTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SmallKpi title="Вийшли на зміну" value="147" note="З 156 активних" />
        <SmallKpi title="Запізнень сьогодні" value="6" note="3 магазини, 3 цехи" />
        <SmallKpi title="Прогулів" value="2" note="Потрібне рішення HR" />
        <SmallKpi title="Заміни сьогодні" value="5" note="3 магазини, 2 цехи" />
      </div>

      <ChartPanel title="Відвідуваність і зміни" subtitle="Виходи на зміни, запізнення, прогули та заміни за тиждень">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={attendanceData}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
            <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
            <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
            <Tooltip content={<ChartTooltip />} />
            <Legend />
            <Bar yAxisId="right" dataKey="replacement" name="Заміни" fill="#c4b5fd" radius={[8, 8, 0, 0]} barSize={18} />
            <Line yAxisId="left" type="monotone" dataKey="onShift" name="Вийшли на зміну" stroke="#0f766e" strokeWidth={3} dot={{ r: 4, fill: '#0f766e' }} />
            <Line yAxisId="right" type="monotone" dataKey="late" name="Запізнення" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }} />
            <Line yAxisId="right" type="monotone" dataKey="noShow" name="Прогули" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 3, fill: '#dc2626' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}

function AbsencesTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SmallKpi title="У відпустці зараз" value="9" note="На 14 днів вперед - 17" />
        <SmallKpi title="Активні лікарняні" value="6" note="2 без остаточного статусу" />
        <SmallKpi title="Конфлікти графіка" value="3" note="Потрібне перенесення" />
        <SmallKpi title="Критичні дати" value="2" note="Нестача продавців у квітні" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <ChartPanel title="Календар ризику" subtitle="Найближчі 7 днів по відсутностях">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {[
              ['15', 'ok'],
              ['16', 'warning'],
              ['17', 'warning'],
              ['18', 'ok'],
              ['19', 'ok'],
              ['20', 'critical'],
              ['21', 'critical'],
            ].map(([day, tone]) => (
              <div
                key={day}
                className={cn(
                  'rounded-2xl border p-4 text-center',
                  tone === 'ok' && 'border-emerald-200 bg-emerald-50',
                  tone === 'warning' && 'border-amber-200 bg-amber-50',
                  tone === 'critical' && 'border-red-200 bg-red-50'
                )}
              >
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Бер</div>
                <div className="mt-1 text-2xl font-bold text-slate-950">{day}</div>
              </div>
            ))}
          </div>
        </ChartPanel>

        <SimpleTable headers={['Працівник', 'Локація', 'Тип', 'Період', 'Статус', 'Заміна']} rows={absenceRows} />
      </div>
    </div>
  );
}

function RecruitmentTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SmallKpi title="Відкриті вакансії" value="11" note="Середній вік вакансії 13 днів" />
        <SmallKpi title="Кандидатів у воронці" value="34" note="7 без зворотного зв'язку" />
        <SmallKpi title="Вийшли цього місяця" value="4" note="3 магазини, 1 цех" />
        <SmallKpi title="Не пройшли ІС" value="2" note="Перші 30 днів" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <ChartPanel title="Воронка підбору" subtitle="Шлях кандидата від відгуку до виходу на роботу">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={recruitmentFunnel} layout="vertical">
              <CartesianGrid stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis type="category" dataKey="stage" tickLine={false} axisLine={false} tick={{ fill: '#475569', fontSize: 12 }} width={96} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Кандидати" fill="#2563eb" radius={[0, 10, 10, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <SimpleTable headers={['Вакансія', 'Локація', 'Вік', 'Канд.', 'Етап']} rows={vacancyRows} />
      </div>
    </div>
  );
}

function EmployeeTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,_#f8fafc,_#eef2ff)] p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl bg-slate-950 text-2xl font-bold text-white">ОГ</div>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <BadgeCheck size={14} />
                Активний співробітник
              </div>
              <div>
                <h3 className="text-3xl font-bold tracking-tight text-slate-950">Оксана Гончар</h3>
                <p className="mt-1 text-base font-medium text-slate-700">Старший продавець</p>
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm text-slate-600 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3">Магазин №5 Героїв Майдану</div>
                <div className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3">Керівник: Ірина Коваль</div>
                <div className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3">Телефон: +380 67 000 00 00</div>
                <div className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3">Статус: повна зайнятість</div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <SmallKpi title="Дата прийому" value="12.09.2024" note="Повна зайнятість" />
            <SmallKpi title="Графік" value="2/2" note="Денна зміна" />
            <SmallKpi title="Випробувальний" value="Пройдено" note="Закрито вчасно" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <IdCard className="text-slate-700" size={18} />
              <h4 className="font-semibold text-slate-950">Основні дані</h4>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm leading-6 text-slate-700 sm:grid-cols-2">
              <InfoField label="ПІБ" value="Оксана Гончар" />
              <InfoField label="Посада" value="Старший продавець" />
              <InfoField label="Локація" value="Магазин №5 Героїв Майдану" />
              <InfoField label="Дата прийому" value="12.09.2024" />
              <InfoField label="Графік" value="2/2, денна зміна" />
              <InfoField label="Наставник" value="Ірина Коваль" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <FileCheck2 className="text-emerald-600" size={18} />
              <h4 className="font-semibold text-slate-950">Документи</h4>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm leading-6 text-slate-700 sm:grid-cols-2">
              <InfoField label="Паспорт / ID" value="Завантажено" />
              <InfoField label="ІПН" value="Завантажено" />
              <InfoField label="Трудовий договір" value="Активний" />
              <InfoField label="Медкнижка" value="Дійсна до 02.11.2026" />
              <InfoField label="Згода на ПД" value="Підписано" />
              <InfoField label="Військовий облік" value="Актуально" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Shuffle className="text-blue-600" size={18} />
              <h4 className="font-semibold text-slate-950">Операційний контур</h4>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm leading-6 text-slate-700 sm:grid-cols-2">
              <InfoField label="Навички" value="Каса, відкриття зміни, закриття зміни" />
              <InfoField label="Може замінити" value="Продавець, старший продавець" />
              <InfoField label="Новачки під наставництвом" value="2" />
              <InfoField label="Дисциплінарні події" value="0" />
              <InfoField label="Остання оцінка" value="4.8 / 5" />
              <InfoField label="Статус адаптації" value="Завершено" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ChartPanel title="Список працівників" subtitle="Оперативний довідник співробітників по локаціях">
            <SimpleTable headers={['ПІБ', 'Посада', 'Локація', 'Графік', 'Статус']} rows={employeeDirectoryRows} />
          </ChartPanel>

          <ChartPanel title="Список кандидатів" subtitle="Поточна воронка кандидатів по відкритих вакансіях">
            <SimpleTable headers={['Кандидат', 'Позиція', 'Локація', 'Етап', 'Джерело']} rows={candidateListRows} />
          </ChartPanel>
        </div>
      </div>
    </div>
  );
}

function ComplianceTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SmallKpi title="Документи з ризиком" value="16" note="Потрібні дії цього тижня" />
        <SmallKpi title="Критичні прострочки" value="3" note="Не можна відкладати" />
        <SmallKpi title="Медкнижки до оновлення" value="7" note="Переважно виробництво" />
        <SmallKpi title="Новачки без повного пакета" value="3" note="Перші 14 днів" />
      </div>

      <SimpleTable headers={['Контур', 'До оновлення', 'Критично', 'Коментар']} rows={complianceRows} />
    </div>
  );
}

function MetricTile({ metric }: { metric: MetricCard }) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/80 p-4 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{metric.label}</div>
      <div className="mt-2 text-2xl font-bold leading-tight text-slate-950 sm:text-3xl break-words">{metric.value}</div>
      <div className="mt-1 text-xs text-slate-600">{metric.note}</div>
      <div className={cn('mt-3 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', badgeTone(metric.tone))}>{metric.badge}</div>
    </div>
  );
}

function ChartPanel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff,_#f8fafc)] p-5 shadow-sm">
      <div className="mb-4">
        <div className="text-lg font-semibold text-slate-950">{title}</div>
        <div className="text-sm text-slate-600">{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function SidebarPanel({ title, icon: Icon, children }: { title: string; icon: typeof AlertTriangle; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={18} className="text-slate-700" />
        <h3 className="font-semibold text-slate-950">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SmallKpi({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 h-full min-h-[150px]">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold leading-tight text-slate-950 sm:text-3xl break-words">{value}</div>
      <div className="mt-1 text-sm text-slate-600">{note}</div>
    </div>
  );
}

function SignalRow({ title, note, tone, compact = false }: { title: string; note: string; tone: Tone; compact?: boolean }) {
  return (
    <div className={cn('rounded-2xl border p-4', compact && 'px-4 py-3', tonePanel(tone))}>
      <div className="font-semibold text-slate-950">{title}</div>
      <div className="mt-1 text-sm leading-6 text-slate-700">{note}</div>
    </div>
  );
}

function ChecklistRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <BadgeCheck size={18} className="mt-0.5 text-emerald-600" />
      <div className="text-sm leading-6 text-slate-700">{text}</div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-medium leading-6 text-slate-900">{value}</div>
    </div>
  );
}
function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
      <div className="grid min-w-[760px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500" style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}>
        {headers.map((header) => (
          <div key={header}>{header}</div>
        ))}
      </div>
      <div className="divide-y divide-slate-200 bg-white">
        {rows.map((row) => (
          <div key={row.join('|')} className="grid min-w-[760px] gap-3 px-4 py-4 text-sm text-slate-700" style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}>
            {row.map((cell, index) => (
              <div key={`${cell}-${index}`} className={index === 0 ? 'font-semibold text-slate-950' : undefined}>
                {cell}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionLink({ href, title, note }: { href: string; title: string; note: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-slate-300 hover:bg-slate-100">
      <div>
        <div className="font-semibold text-slate-950">{title}</div>
        <div className="text-xs text-slate-600">{note}</div>
      </div>
      <ArrowRight size={18} className="text-slate-400" />
    </Link>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number | string; color?: string }>; label?: string }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
      {label ? <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</div> : null}
      <div className="space-y-1.5">
        {payload.map((item) => (
          <div key={`${item.name}-${item.value}`} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color ?? '#94a3b8' }} />
              {item.name}
            </div>
            <div className="font-semibold text-slate-950">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function tonePanel(tone: Tone) {
  if (tone === 'critical') return 'border-red-200 bg-red-50';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50';
  return 'border-emerald-200 bg-emerald-50';
}

function badgeTone(tone: Tone) {
  if (tone === 'critical') return 'bg-red-50 text-red-700';
  if (tone === 'warning') return 'bg-amber-50 text-amber-700';
  return 'bg-emerald-50 text-emerald-700';
}











