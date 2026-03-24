'use client';

import React, { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { format, addDays } from 'date-fns';
import { AlertTriangle, Download, RefreshCw, CalendarDays, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateBakeryForecastExcel, type ForecastRow, type StoreInfo, type SkuInfo } from '@/lib/bakery-forecast-export';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawForecast {
    id: number;
    target_date: string;
    store_id: number;
    sku_id: number;
    predicted_demand: number;
    oos_count: number;
    oos_correction: number;
    production_order: number;
    final_distribution: number;
}

interface ApiResponse {
    forecasts: RawForecast[];
    stores: StoreInfo[];
    skus: SkuInfo[];
    categories: string[];
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) =>
    fetch(url, { credentials: 'same-origin' }).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
    });

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ children, content }: { children: React.ReactNode; content: React.ReactNode }) {
    const [visible, setVisible] = useState(false);
    return (
        <div
            className="relative inline-flex items-center justify-center w-full h-full"
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            {children}
            {visible && content && (
                <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 pointer-events-none">
                    <div className="bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2 shadow-xl whitespace-nowrap leading-relaxed">
                        {content}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Editable cell ────────────────────────────────────────────────────────────

function EditableCell({
    value,
    predicted,
    oosCorrection,
    oosCount,
    onChange,
}: {
    value: number;
    predicted: number;
    oosCorrection: number;
    oosCount: number;
    onChange: (v: number) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(String(value));
    const isOos = oosCorrection > 0;

    const commit = () => {
        const n = parseInt(draft, 10);
        if (!isNaN(n) && n >= 0) onChange(n);
        else setDraft(String(value));
        setEditing(false);
    };

    const tooltipContent = (
        <span>
            Прогноз: <strong>{predicted.toFixed(1)}</strong>
            {isOos && (
                <>
                    {' · '}OOS за 3 тижні: <strong>{oosCount}</strong>
                    {' · '}Поправка: <strong>+{oosCorrection}</strong>
                </>
            )}
        </span>
    );

    if (editing) {
        return (
            <input
                autoFocus
                type="number"
                min={0}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={e => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); }
                }}
                className="w-full h-full text-center text-[12px] font-semibold bg-blue-50 border border-blue-400 rounded outline-none px-1"
            />
        );
    }

    return (
        <Tooltip content={tooltipContent}>
            <button
                onClick={() => { setDraft(String(value)); setEditing(true); }}
                className={cn(
                    'w-full h-full flex items-center justify-center gap-1 text-[12px] font-semibold rounded transition-colors',
                    isOos
                        ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                        : value === 0
                            ? 'text-slate-300 hover:bg-slate-50'
                            : 'text-slate-700 hover:bg-blue-50'
                )}
            >
                {isOos && <AlertTriangle size={11} className="text-amber-500 shrink-0" />}
                <span>{value || '—'}</span>
            </button>
        </Tooltip>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BakeryForecastsPage() {
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const [date, setDate] = useState(tomorrow);
    const [category, setCategory] = useState('');
    const [overrides, setOverrides] = useState<Record<string, number>>({});
    const [exporting, setExporting] = useState(false);

    const apiUrl = `/api/bakery/forecasts?date=${date}${category ? `&category=${encodeURIComponent(category)}` : ''}`;

    const { data, error, isLoading, mutate } = useSWR<ApiResponse>(apiUrl, fetcher, {
        revalidateOnFocus: false,
        onSuccess: () => setOverrides({}), // reset edits when data reloads
    });

    // Merge server data with local overrides
    const cellKey = (storeId: number, skuId: number) => `${storeId}_${skuId}`;

    const getValue = useCallback((storeId: number, skuId: number, serverVal: number): number => {
        const k = cellKey(storeId, skuId);
        return k in overrides ? overrides[k] : serverVal;
    }, [overrides]);

    const handleCellChange = (storeId: number, skuId: number, v: number) => {
        setOverrides(prev => ({ ...prev, [cellKey(storeId, skuId)]: v }));
    };

    // Build forecast lookup map
    const forecastMap = useMemo(() => {
        const m = new Map<string, RawForecast>();
        for (const f of data?.forecasts ?? []) m.set(cellKey(f.store_id, f.sku_id), f);
        return m;
    }, [data]);

    // Compute row totals
    const rowTotals = useMemo(() => {
        const m = new Map<number, number>();
        for (const store of data?.stores ?? []) {
            const sum = (data?.skus ?? []).reduce((acc, sku) => {
                const fc = forecastMap.get(cellKey(store.id, sku.id));
                return acc + getValue(store.id, sku.id, fc?.final_distribution ?? 0);
            }, 0);
            m.set(store.id, sum);
        }
        return m;
    }, [data, forecastMap, getValue]);

    // Compute column totals
    const colTotals = useMemo(() => {
        const m = new Map<number, number>();
        for (const sku of data?.skus ?? []) {
            const sum = (data?.stores ?? []).reduce((acc, store) => {
                const fc = forecastMap.get(cellKey(store.id, sku.id));
                return acc + getValue(store.id, sku.id, fc?.final_distribution ?? 0);
            }, 0);
            m.set(sku.id, sum);
        }
        return m;
    }, [data, forecastMap, getValue]);

    const grandTotal = useMemo(() =>
        Array.from(colTotals.values()).reduce((a, b) => a + b, 0),
        [colTotals]
    );

    const hasOverrides = Object.keys(overrides).length > 0;

    const handleExport = async () => {
        if (!data) return;
        setExporting(true);
        try {
            // Merge overrides into forecast rows for export
            const mergedForecasts: ForecastRow[] = data.forecasts.map(f => ({
                ...f,
                final_distribution: getValue(f.store_id, f.sku_id, f.final_distribution),
            }));
            await generateBakeryForecastExcel(date, mergedForecasts, data.stores, data.skus);
        } finally {
            setExporting(false);
        }
    };

    const isEmpty = !isLoading && !error && (!data?.forecasts || data.forecasts.length === 0);

    return (
        <div className="flex flex-col gap-5 min-h-0">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-end gap-4 justify-between">
                <div>
                    <h1 className="text-xl font-bold text-[#1F3864]">Прогнозування і Заказ</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Матриця розподілу продукції по магазинах на обрану дату
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {/* Date picker */}
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
                        <CalendarDays size={16} className="text-[#2E75B6]" />
                        <input
                            type="date"
                            value={date}
                            onChange={e => { setDate(e.target.value); setOverrides({}); }}
                            className="text-sm font-medium text-slate-700 outline-none bg-transparent"
                        />
                    </div>

                    {/* Category filter */}
                    {(data?.categories?.length ?? 0) > 0 && (
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
                            <Filter size={15} className="text-slate-400" />
                            <select
                                value={category}
                                onChange={e => { setCategory(e.target.value); setOverrides({}); }}
                                className="text-sm text-slate-700 outline-none bg-transparent"
                            >
                                <option value="">Всі категорії</option>
                                {data?.categories?.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Refresh */}
                    <button
                        onClick={() => { setOverrides({}); mutate(); }}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-slate-600 hover:bg-slate-50 shadow-sm transition-colors"
                    >
                        <RefreshCw size={15} className={cn(isLoading && 'animate-spin')} />
                        Оновити
                    </button>

                    {/* Export */}
                    <button
                        onClick={handleExport}
                        disabled={exporting || !data || data.forecasts.length === 0}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1F3864] text-white text-sm font-medium hover:bg-[#2E75B6] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
                    >
                        <Download size={15} />
                        {exporting ? 'Генерація...' : 'Скачати Excel'}
                    </button>
                </div>
            </div>

            {/* ── Edit notice ────────────────────────────────────────────────── */}
            {hasOverrides && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
                    <AlertTriangle size={15} className="text-amber-500 shrink-0" />
                    <span>
                        Є ручні правки ({Object.keys(overrides).length} осередків).
                        Підсумки перераховані. При натисканні «Оновити» правки будуть скасовані.
                    </span>
                </div>
            )}

            {/* ── Legend ─────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-0.5 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-amber-800">
                        <AlertTriangle size={10} />⚠
                    </span>
                    Коригування OOS (≥2 випадки за 3 тижні)
                </span>
                <span>· Натисніть на клітинку для редагування</span>
                <span>· Наведіть для перегляду чистого прогнозу</span>
            </div>

            {/* ── States ─────────────────────────────────────────────────────── */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
                    Помилка завантаження: {error.message}
                </div>
            )}

            {isLoading && (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm gap-2">
                    <RefreshCw size={16} className="animate-spin" />
                    Завантаження прогнозу...
                </div>
            )}

            {isEmpty && (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
                    <CalendarDays size={32} className="text-slate-300" />
                    <p className="text-sm">Прогноз на <strong>{date}</strong> ще не готовий.</p>
                    <p className="text-xs text-slate-400">AI-модель не записала дані для цієї дати.</p>
                </div>
            )}

            {/* ── Matrix table ────────────────────────────────────────────────── */}
            {!isLoading && !error && data && data.forecasts.length > 0 && (
                <div className="overflow-auto rounded-xl border border-gray-200 shadow-sm bg-white">
                    <table className="border-collapse text-[12px] min-w-full">

                        {/* Table head */}
                        <thead>
                            <tr>
                                {/* Store column header */}
                                <th
                                    className="sticky left-0 z-20 text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-white whitespace-nowrap min-w-[160px]"
                                    style={{ background: '#1F3864' }}
                                >
                                    Магазин
                                </th>

                                {/* SKU headers */}
                                {data.skus.map(sku => (
                                    <th
                                        key={sku.id}
                                        className="px-2 py-3 text-center text-[10px] font-semibold text-white whitespace-normal leading-tight max-w-[100px]"
                                        style={{ background: '#1F3864', minWidth: 80, maxWidth: 120 }}
                                    >
                                        {sku.name}
                                    </th>
                                ))}

                                {/* Row total header */}
                                <th
                                    className="px-3 py-3 text-center text-[11px] font-bold text-white whitespace-nowrap"
                                    style={{ background: '#2E75B6', minWidth: 72 }}
                                >
                                    ВСЬОГО
                                </th>
                            </tr>
                        </thead>

                        {/* Table body */}
                        <tbody>
                            {data.stores.map((store, rowIdx) => (
                                <tr
                                    key={store.id}
                                    className={cn(
                                        'border-b border-gray-100',
                                        rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'
                                    )}
                                >
                                    {/* Store name */}
                                    <td className="sticky left-0 z-10 px-4 py-0 font-semibold text-slate-700 whitespace-nowrap bg-inherit border-r border-gray-200"
                                        style={{ height: 36 }}>
                                        {store.name}
                                    </td>

                                    {/* Distribution cells */}
                                    {data.skus.map(sku => {
                                        const fc = forecastMap.get(cellKey(store.id, sku.id));
                                        const val = getValue(store.id, sku.id, fc?.final_distribution ?? 0);
                                        return (
                                            <td
                                                key={sku.id}
                                                className="p-0 border-r border-gray-100"
                                                style={{ height: 36, padding: 0 }}
                                            >
                                                <EditableCell
                                                    value={val}
                                                    predicted={fc?.predicted_demand ?? 0}
                                                    oosCorrection={fc?.oos_correction ?? 0}
                                                    oosCount={fc?.oos_count ?? 0}
                                                    onChange={v => handleCellChange(store.id, sku.id, v)}
                                                />
                                            </td>
                                        );
                                    })}

                                    {/* Row total */}
                                    <td
                                        className="px-3 text-center font-bold text-white"
                                        style={{ background: '#2E75B6', height: 36 }}
                                    >
                                        {rowTotals.get(store.id) ?? 0}
                                    </td>
                                </tr>
                            ))}
                        </tbody>

                        {/* Footer: column totals */}
                        <tfoot>
                            <tr style={{ background: '#1F3864' }}>
                                <td className="sticky left-0 z-10 px-4 py-3 text-[11px] font-bold uppercase text-white whitespace-nowrap border-r border-blue-900"
                                    style={{ background: '#1F3864' }}>
                                    ВСЬОГО ВИРОБИТИ
                                </td>
                                {data.skus.map(sku => (
                                    <td
                                        key={sku.id}
                                        className="px-2 py-3 text-center text-[12px] font-bold text-white border-r border-blue-900"
                                    >
                                        {colTotals.get(sku.id) ?? 0}
                                    </td>
                                ))}
                                <td
                                    className="px-3 py-3 text-center text-[13px] font-bold text-white"
                                    style={{ background: '#2E75B6' }}
                                >
                                    {grandTotal}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
}
