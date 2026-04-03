'use client';

import React from 'react';
import useSWR from 'swr';
import { Download, Calendar, Loader2, Store, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

type SalesRow = {
    storeId: number;
    storeName: string;
    values: Record<string, number>;
    total: number;
};

type SalesPayload = {
    startDate: string;
    endDate: string;
    periodLabel: string;
    isSingleDay: boolean;
    breads: string[];
    stores: { storeId: number; storeName: string }[];
    rows: SalesRow[];
    columnTotals: Record<string, number>;
    grandTotal: number;
    transactionCount: number;
};

type OosRow = {
    storeId: number;
    storeName: string;
    balances: Record<string, number>;
    totalOos: number;
};

type OosPayload = {
    date: string;
    nextSnapshotDate: string;
    periodLabel: string;
    breads: string[];
    stores: { storeId: number; storeName: string }[];
    rows: OosRow[];
    breadTotals: Record<string, number>;
    totalOos: number;
    source: 'balance_snapshots' | 'daily_oos' | 'empty';
};

const fetcher = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || payload?.error || 'Помилка завантаження даних');
    }
    return response.json();
};

function formatDateInput(value: string) {
    return value || '';
}

function formatNumber(value: number) {
    return new Intl.NumberFormat('uk-UA').format(value || 0);
}

function formatDisplayDate(iso: string) {
    const [year, month, day] = iso.split('-');
    return `${day}.${month}.${year}`;
}

function defaultRange() {
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(end.getDate() - 13);
    return {
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
    };
}

type CraftBreadSalesProps = {
    embedded?: boolean;
};

export const CraftBreadSales = ({ embedded = false }: CraftBreadSalesProps) => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const fallback = defaultRange();

    const startDate = searchParams.get('start_date') || fallback.start_date;
    const endDate = searchParams.get('end_date') || fallback.end_date;
    const isSingleDay = startDate === endDate;

    const salesQuery = `/api/bakery/sales?start_date=${startDate}&end_date=${endDate}`;
    const exportHref = `/api/bakery/sales/export?start_date=${startDate}&end_date=${endDate}`;
    const oosQuery = isSingleDay ? `/api/bakery/sales/eod-oos?date=${startDate}` : null;

    const { data, error, isLoading } = useSWR<SalesPayload>(salesQuery, fetcher);
    const { data: oosData, error: oosError, isLoading: oosLoading } = useSWR<OosPayload>(oosQuery, fetcher);

    const updateRange = (nextStart: string, nextEnd: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('start_date', nextStart);
        params.set('end_date', nextEnd);
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const breads = data?.breads || [];
    const rows = data?.rows || [];
    const oosRows = oosData?.rows || [];

    const shellClassName = embedded
        ? 'text-slate-900'
        : 'min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc,_#eef4ff_45%,_#f8fafc)] text-slate-900';

    const contentClassName = embedded
        ? 'space-y-6'
        : 'mx-auto max-w-[1680px] px-4 py-6 md:px-8 md:py-8 space-y-6';

    return (
        <div className={shellClassName}>
            <div className={contentClassName}>
                <header className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur-md md:p-8">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-4">
                            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                                <Store size={14} className="text-blue-600" />
                                Крафтовий хліб
                            </div>
                            <div>
                                <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900 md:text-5xl">
                                    Продажі
                                </h1>
                                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500 md:text-base">
                                    Pivot по магазинах і хлібах. У таблиці показані тільки свіжі продажі в штуках, без дисконту.
                                    Для одного дня додатково показується OOS на кінець дня через ранковий snapshot наступного дня.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                                <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                                    <Calendar size={16} className="text-blue-600" />
                                    Період продажів
                                </div>
                                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-4">
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <DateField
                                            label="Від"
                                            value={startDate}
                                            max={endDate}
                                            onChange={(value) => updateRange(value, endDate)}
                                        />
                                        <DateField
                                            label="До"
                                            value={endDate}
                                            min={startDate}
                                            onChange={(value) => updateRange(startDate, value)}
                                        />
                                    </div>
                                    <a
                                        href={exportHref}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-blue-700"
                                    >
                                        <FileSpreadsheet size={14} />
                                        Вивантажити Excel
                                        <Download size={14} />
                                    </a>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <InfoCard title="Період" value={data?.periodLabel || `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`} />
                                <InfoCard title="Магазини" value={formatNumber(rows.length)} />
                                <InfoCard title="Разом, шт" value={formatNumber(data?.grandTotal || 0)} />
                            </div>
                        </div>
                    </div>
                </header>

                <section className="rounded-3xl border border-slate-200 bg-white/85 p-4 shadow-sm md:p-6">
                    <div className="mb-4 flex items-center justify-between gap-4">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Pivot</div>
                            <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">
                                Магазини × Хліби
                            </h2>
                        </div>
                        {isLoading && (
                            <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                                <Loader2 size={14} className="animate-spin" />
                                Завантаження
                            </div>
                        )}
                    </div>

                    {error ? (
                        <AlertBox title="Не вдалося завантажити продажі" message={error.message} />
                    ) : (
                        <div className="overflow-auto rounded-2xl border border-slate-200">
                            <table className="min-w-full border-collapse text-sm">
                                <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                                    <tr>
                                        <Th className="left-0 sticky z-20 bg-slate-950">Магазин</Th>
                                        {breads.map((bread) => (
                                            <Th key={bread} className="min-w-[130px] text-center">
                                                {bread}
                                            </Th>
                                        ))}
                                        <Th className="text-center">Разом</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={Math.max(2, breads.length + 2)}
                                                className="px-6 py-12 text-center text-slate-400"
                                            >
                                                Немає даних за вибраний період
                                            </td>
                                        </tr>
                                    ) : (
                                        rows.map((row, index) => (
                                            <tr key={row.storeId} className={index % 2 === 0 ? 'bg-slate-50/60' : 'bg-white'}>
                                                <Td className="font-semibold text-slate-900">
                                                    {row.storeName}
                                                </Td>
                                                {breads.map((bread) => {
                                                    const value = row.values[bread] || 0;
                                                    return (
                                                        <Td
                                                            key={bread}
                                                            className={cn(
                                                                'text-center font-mono',
                                                                value > 0 ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400'
                                                            )}
                                                        >
                                                            {formatNumber(value)}
                                                        </Td>
                                                    );
                                                })}
                                                <Td className="text-center font-mono font-bold text-blue-700">
                                                    {formatNumber(row.total)}
                                                </Td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                                <tfoot className="bg-blue-50">
                                    <tr>
                                        <Td className="font-black uppercase tracking-wider text-slate-700">Разом</Td>
                                        {breads.map((bread) => (
                                            <Td key={bread} className="text-center font-mono font-bold text-blue-700">
                                                {formatNumber(data?.columnTotals?.[bread] || 0)}
                                            </Td>
                                        ))}
                                        <Td className="text-center font-mono font-black text-slate-900">
                                            {formatNumber(data?.grandTotal || 0)}
                                        </Td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </section>

                {isSingleDay && (
                    <section className="rounded-3xl border border-slate-200 bg-white/85 p-4 shadow-sm md:p-6">
                        <div className="mb-4 flex items-center justify-between gap-4">
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">OOS</div>
                                <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">
                                    Кінець дня на {formatDisplayDate(startDate)}
                                </h2>
                            </div>
                            {oosLoading && (
                                <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                                    <Loader2 size={14} className="animate-spin" />
                                    Завантаження
                                </div>
                            )}
                        </div>

                        {oosError ? (
                            <AlertBox title="Не вдалося завантажити OOS" message={oosError.message} />
                        ) : (
                            <div className="overflow-auto rounded-2xl border border-slate-200">
                                <table className="min-w-full border-collapse text-sm">
                                    <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                                        <tr>
                                            <Th className="left-0 sticky z-20 bg-slate-950">Магазин</Th>
                                            {oosData?.breads?.map((bread) => (
                                                <Th key={bread} className="min-w-[130px] text-center">
                                                    {bread}
                                                </Th>
                                            ))}
                                            <Th className="text-center">OOS</Th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(oosRows.length > 0 ? oosRows : rows.map((row) => ({
                                            storeId: row.storeId,
                                            storeName: row.storeName,
                                            balances: Object.fromEntries((oosData?.breads || breads).map((bread) => [bread, -1])),
                                            totalOos: 0,
                                        }))).map((row, index) => (
                                            <tr key={row.storeId} className={index % 2 === 0 ? 'bg-slate-50/60' : 'bg-white'}>
                                                <Td className="font-semibold text-slate-900">
                                                    {row.storeName}
                                                </Td>
                                                {(oosData?.breads || breads).map((bread) => {
                                                    const value = row.balances[bread] ?? -1;
                                                    return (
                                                        <Td
                                                            key={bread}
                                                            className={cn(
                                                                'text-center font-mono',
                                                                value === 0
                                                                    ? 'bg-red-50 text-red-700'
                                                                    : value > 0
                                                                        ? 'bg-emerald-50 text-emerald-700'
                                                                        : 'text-slate-400'
                                                            )}
                                                        >
                                                            {value < 0 ? '—' : formatNumber(value)}
                                                        </Td>
                                                    );
                                                })}
                                                <Td className="text-center font-mono font-bold text-red-700">
                                                    {formatNumber(row.totalOos)}
                                                </Td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-red-50">
                                        <tr>
                                            <Td className="font-black uppercase tracking-wider text-slate-700">OOS</Td>
                                            {(oosData?.breads || breads).map((bread) => (
                                                <Td key={bread} className="text-center font-mono font-bold text-red-700">
                                                    {formatNumber(oosData?.breadTotals?.[bread] || 0)}
                                                </Td>
                                            ))}
                                            <Td className="text-center font-mono font-black text-slate-900">
                                                {formatNumber(oosData?.totalOos || 0)}
                                            </Td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
};

function InfoCard({ title, value }: { title: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{title}</div>
            <div className="mt-1 text-xl font-black tracking-tight text-slate-900">{value}</div>
        </div>
    );
}

function DateField({
    label,
    value,
    onChange,
    min,
    max,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    min?: string;
    max?: string;
}) {
    return (
        <label className="flex min-w-[180px] flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">{label}</span>
            <input
                type="date"
                value={formatDateInput(value)}
                onChange={(e) => onChange(e.target.value)}
                min={min}
                max={max}
                className="cursor-pointer bg-transparent font-mono text-sm font-bold text-slate-800 outline-none"
            />
        </label>
    );
}

function AlertBox({ title, message }: { title: string; message: string }) {
    return (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-red-700">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div>
                <div className="font-bold">{title}</div>
                <div className="mt-1 text-sm text-red-600">{message}</div>
            </div>
        </div>
    );
}

function Th({ className = '', children }: React.PropsWithChildren<{ className?: string }>) {
    return (
        <th className={cn('px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white', className)}>
            {children}
        </th>
    );
}

function Td({ className = '', children }: React.PropsWithChildren<{ className?: string }>) {
    return <td className={cn('border-t border-slate-200 px-4 py-3', className)}>{children}</td>;
}
