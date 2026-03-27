import React, { useState } from 'react';
import useSWR from 'swr';
import { Play, Loader2, RefreshCw, CheckCircle2, ShoppingBag, Truck, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { generateDistributionExcel } from '@/lib/order-export';
import { authedFetcher } from '@/lib/authed-fetcher';

interface DistributionResult {
    product_name: string;
    spot_name: string;
    quantity_to_ship: number;
    min_stock?: number;
    current_stock?: number;
    avg_sales?: number;
    unit?: string;
    packaging_enabled?: boolean;
    quantity_to_ship_packs_est?: number;
    calc_time?: string;
    created_at?: string;
}

interface DistributionRunResponse {
    success?: boolean;
    error?: string;
    message?: string;
    code?: string;
    batch_id?: string;
    products_processed?: number;
    total_kg?: number;
}

const fetcher = authedFetcher;

function isKgUnit(unit: unknown): boolean {
    const normalized = String(unit || '').trim().toLowerCase();
    return normalized === 'kg' || normalized === 'кг';
}

function formatQty(value: unknown, unit: unknown): string {
    const safe = Number(value || 0);
    if (!Number.isFinite(safe)) return '0';
    return isKgUnit(unit) ? safe.toFixed(2) : safe.toFixed(0);
}

function packLabel(packs: unknown): string {
    const safe = Number(packs || 0);
    if (!Number.isFinite(safe) || safe <= 0) return '0 уп.';
    return `~${safe} уп.`;
}

export const BulvarDistributionControlPanel = () => {
    const {
        data: resultsData,
        isLoading: resultsLoading,
        mutate: refreshResults,
    } = useSWR<DistributionResult[]>('/api/bulvar/distribution/results', fetcher, {
        refreshInterval: 10000,
    });

    const [isRunning, setIsRunning] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [lastRunResult, setLastRunResult] = useState<string | null>(null);

    const handleExport = async () => {
        if (!resultsData || resultsData.length === 0) return;

        setIsExporting(true);
        try {
            await generateDistributionExcel(resultsData, 'Бульвар');
            setLastRunResult('Файл сохранен');
            setTimeout(() => setLastRunResult(null), 3000);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Ошибка при экспорте');
        } finally {
            setIsExporting(false);
        }
    };

    const handleRunDistribution = async () => {
        setIsRunning(true);
        setLastRunResult(null);

        try {
            const res = await fetch('/api/bulvar/distribution/run', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    Accept: 'application/json',
                },
            });

            const contentType = res.headers.get('content-type') || '';
            const isJson = contentType.includes('application/json');

            let payload: DistributionRunResponse = {};
            if (isJson) {
                payload = await res.json();
            } else {
                const text = await res.text();
                throw new Error(
                    `Non-JSON response from /api/bulvar/distribution/run (status ${res.status}): ${text.slice(0, 200)}`
                );
            }

            if (!res.ok) {
                const details = [payload.error, payload.message, payload.code].filter(Boolean).join(' | ');
                throw new Error(details || 'Failed to run distribution');
            }

            const uiMessage =
                payload.message ||
                `Batch: ${String(payload.batch_id ?? '').slice(0, 8)} | Позиций: ${payload.products_processed ?? 0} | Объем: ${payload.total_kg ?? 0} кг`;
            setLastRunResult(uiMessage);
            await refreshResults();
        } catch (error: unknown) {
            console.error('Distribution error:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            setLastRunResult(`Error: ${message}`);
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-bg-primary overflow-hidden font-sans text-text-primary">
            <div className="p-4 lg:p-6 pb-2 lg:pb-4 flex flex-col md:flex-row items-center justify-between gap-6 z-10 shrink-0">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                        <Truck size={24} className="text-orange-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-text-primary uppercase tracking-wide font-[family-name:var(--font-chakra)]">
                            Панель логиста
                        </h2>
                        <div className="text-[10px] text-text-secondary uppercase font-black tracking-widest mt-1 font-[family-name:var(--font-jetbrains)]">
                            Управление распределением продукции
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-end gap-2 w-full md:w-auto">
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <button
                            onClick={handleExport}
                            disabled={isExporting || resultsLoading || !resultsData || resultsData.length === 0}
                            className={cn(
                                'h-12 px-6 rounded-xl font-bold uppercase tracking-wider transition-all flex items-center gap-2 border shadow-[0_0_15px_rgba(0,0,0,0.2)] shrink-0',
                                !resultsData || resultsData.length === 0
                                    ? 'bg-bg-primary border-panel-border text-text-muted cursor-not-allowed'
                                    : 'bg-panel-bg text-[#00E0FF] border-[#00E0FF]/30 hover:bg-[#00E0FF]/10 hover:border-[#00E0FF]/60 hover:shadow-[0_0_15px_rgba(0,224,255,0.2)] active:scale-[0.98]'
                            )}
                            title="Скачать Excel"
                        >
                            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                            <span className="hidden sm:inline text-xs font-[family-name:var(--font-chakra)] tracking-widest">
                                Excel
                            </span>
                        </button>

                        <button
                            onClick={handleRunDistribution}
                            disabled={isRunning}
                            className={cn(
                                'relative overflow-hidden h-12 px-8 rounded-xl font-black uppercase tracking-wider transition-all flex items-center gap-3 shadow-[0_0_15px_rgba(255,138,0,0.2)] w-full md:w-auto justify-center text-white',
                                isRunning
                                    ? 'bg-bg-primary text-text-muted cursor-not-allowed border border-panel-border'
                                    : 'bg-orange-500 hover:bg-orange-400 hover:shadow-[0_0_20px_rgba(255,138,0,0.4)] hover:scale-[1.02] active:scale-[0.98] border border-orange-400/50'
                            )}
                        >
                            {isRunning ? (
                                <>
                                    <Loader2 size={20} className="animate-spin text-text-muted" />
                                    <span className="text-text-muted">Расчет...</span>
                                </>
                            ) : (
                                <>
                                    <Play size={20} fill="currentColor" />
                                    <span>Сформировать распределение</span>
                                </>
                            )}
                        </button>
                    </div>

                    <AnimatePresence>
                        {lastRunResult && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="text-xs font-[family-name:var(--font-jetbrains)] text-emerald-400 flex items-center gap-1.5 font-medium"
                            >
                                <CheckCircle2 size={14} />
                                {lastRunResult}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="flex-1 overflow-hidden p-3 lg:p-4 pt-0">
                <div className="bg-panel-bg h-full flex flex-col overflow-hidden rounded-2xl border border-panel-border shadow-[var(--panel-shadow)]">
                    <div className="grid grid-cols-12 gap-4 p-4 border-b border-panel-border bg-slate-50/80 text-[11px] uppercase font-bold tracking-widest text-slate-500 font-[family-name:var(--font-jetbrains)] items-center">
                        <div className="col-span-1 text-center">#</div>
                        <div className="col-span-3 text-slate-600">Товар</div>
                        <div className="col-span-2 text-slate-600">Магазин</div>
                        <div className="col-span-1 text-center text-slate-600">Факт</div>
                        <div className="col-span-1 text-center text-slate-600">Мин</div>
                        <div className="col-span-2 text-center text-slate-600">Ср. прод</div>
                        <div className="col-span-2 text-right text-slate-600">Кол-во</div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                        {resultsLoading ? (
                            <div className="flex flex-col items-center justify-center h-full text-text-secondary gap-3">
                                <Loader2 size={32} className="animate-spin text-orange-500" />
                                <span className="text-xs tracking-widest font-[family-name:var(--font-jetbrains)]">
                                    Загрузка данных...
                                </span>
                            </div>
                        ) : !Array.isArray(resultsData) || resultsData.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-text-muted gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-panel-border/30 flex items-center justify-center border border-panel-border">
                                    <ShoppingBag size={32} className="text-text-secondary opacity-50" />
                                </div>
                                <span className="text-xs uppercase tracking-widest font-bold text-text-secondary">
                                    Распределение еще не сформировано
                                </span>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {resultsData.map((row, idx) => (
                                    <motion.div
                                        key={`${row.product_name}-${row.spot_name}-${idx}`}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="grid grid-cols-12 gap-4 p-3 rounded-lg hover:bg-bg-primary transition-colors border border-transparent hover:border-panel-border items-center group"
                                    >
                                        <div className="col-span-1 text-center text-slate-400 font-[family-name:var(--font-jetbrains)] text-[11px]">
                                            {idx + 1}
                                        </div>
                                        <div
                                            className="col-span-3 font-bold text-text-primary text-sm group-hover:text-orange-400 transition-colors line-clamp-2"
                                            title={row.product_name}
                                        >
                                            {row.product_name}
                                        </div>
                                        <div
                                            className="col-span-2 text-[11px] text-text-secondary line-clamp-2 font-medium group-hover:text-text-primary transition-colors"
                                            title={row.spot_name}
                                        >
                                            {row.spot_name}
                                        </div>
                                        <div className="col-span-1 text-center font-mono text-[11px] text-emerald-500/80">
                                            {formatQty(row.current_stock || 0, row.unit)}
                                        </div>
                                        <div className="col-span-1 text-center font-mono text-[11px] text-orange-400/80">
                                            {formatQty(row.min_stock || 0, row.unit)}
                                        </div>
                                        <div className="col-span-2 text-center font-mono text-[11px] text-blue-400/80">
                                            {Number(row.avg_sales || 0).toFixed(1)}
                                        </div>

                                        <div className="col-span-2 text-right flex flex-col items-end">
                                            <span className="inline-flex items-center justify-center px-4 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 text-sm font-black font-[family-name:var(--font-jetbrains)] border border-orange-500/20 min-w-[3.5rem] shadow-[0_0_10px_rgba(255,138,0,0.1)]">
                                                {formatQty(row.quantity_to_ship, row.unit)}
                                            </span>
                                            {Boolean(row.packaging_enabled) && isKgUnit(row.unit) ? (
                                                <span className="mt-1 text-[10px] font-bold text-slate-500 font-[family-name:var(--font-jetbrains)]">
                                                    {packLabel(row.quantity_to_ship_packs_est)}
                                                </span>
                                            ) : null}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-3 border-t border-panel-border bg-slate-50/80 flex justify-between items-center text-[11px] text-slate-500 uppercase tracking-widest font-[family-name:var(--font-jetbrains)] font-medium">
                        <div>
                            Всего позиций: <span className="text-slate-900 font-bold">{resultsData?.length || 0}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span>
                                Последнее обновление:{' '}
                                <span className="text-slate-900 font-bold">{new Date().toLocaleTimeString()}</span>
                            </span>
                            <button
                                onClick={() => refreshResults()}
                                className="p-1.5 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors shadow-sm border border-transparent hover:border-blue-200"
                            >
                                <RefreshCw size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
