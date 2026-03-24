import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Play, Loader2, RefreshCw, ShoppingBag, CheckCircle2, Send, Truck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { generateDistributionExcel } from '@/lib/distribution-export';
import { ShopSelector } from '../ShopSelector';
import { createClient } from '@/utils/supabase/client';

interface SadovaResult {
    id: number;
    product_id: number;
    product_name: string;
    spot_id: number | null;
    spot_name: string;
    quantity_to_ship: number;
    calculation_batch_id: string;
    business_date: string;
    delivery_status: string;
    created_at: string;
    stock_now?: number | null;
    min_stock?: number | null;
    avg_sales_day?: number | null;
}

interface SadovaShop {
    spot_id: number;
    storage_id: number;
    spot_name: string;
}

interface SadovaRunResponse {
    success: boolean;
    error?: string;
    batch_id?: string;
    products_processed?: number;
    total_kg?: number;
    live_sync?: {
        partial_sync?: boolean;
    };
}

type ApiObject = Record<string, unknown>;

const WAREHOUSE_ROW_NAME = 'Остаток на Складі';

export const SadovaDistributionPanel = () => {
    const [loading, setLoading] = useState(false);
    const [tableLoading, setTableLoading] = useState(false);
    const [shopsLoading, setShopsLoading] = useState(true);
    const [tableData, setTableData] = useState<SadovaResult[]>([]);
    const [shops, setShops] = useState<SadovaShop[]>([]);
    const [selectedShops, setSelectedShops] = useState<number[]>([]);
    const [lastRunMessage, setLastRunMessage] = useState<string | null>(null);

    const summary = useMemo(() => {
        const uniqueProducts = new Set(tableData.map((row) => row.product_id)).size;
        const totalKg = tableData.reduce((sum, row) => sum + Number(row.quantity_to_ship || 0), 0);
        const distributedKg = tableData
            .filter((row) => row.spot_name !== WAREHOUSE_ROW_NAME)
            .reduce((sum, row) => sum + Number(row.quantity_to_ship || 0), 0);
        const warehouseFreeKg = tableData
            .filter((row) => row.spot_name === WAREHOUSE_ROW_NAME)
            .reduce((sum, row) => sum + Number(row.quantity_to_ship || 0), 0);
        const uniqueShops = new Set(
            tableData
                .map((row) => row.spot_name)
                .filter((name) => name && name !== WAREHOUSE_ROW_NAME)
        ).size;

        return {
            rows: tableData.length,
            uniqueProducts,
            totalKg,
            distributedKg,
            warehouseFreeKg,
            uniqueShops,
        };
    }, [tableData]);

    const authedFetch = useCallback(async (url: string, options: RequestInit = {}) => {
        const supabase = createClient();
        const {
            data: { session },
        } = await supabase.auth.getSession();

        const headers = new Headers(options.headers);
        if (session?.access_token) {
            headers.set('Authorization', `Bearer ${session.access_token}`);
        }

        return fetch(url, {
            ...options,
            credentials: 'include',
            headers,
        });
    }, []);

    const extractApiError = useCallback((raw: unknown, fallback: string): string => {
        if (!raw || typeof raw !== 'object') return fallback;
        const obj = raw as ApiObject;
        if (typeof obj.error === 'string' && obj.error.trim()) return obj.error;
        if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
        if (typeof obj.code === 'string' && obj.code.trim()) return obj.code;
        if (obj.error && typeof obj.error === 'object') {
            const nested = obj.error as ApiObject;
            if (typeof nested.message === 'string' && nested.message.trim()) return nested.message;
            if (typeof nested.code === 'string' && nested.code.trim()) return nested.code;
        }
        return fallback;
    }, []);

    const fetchShops = useCallback(async () => {
        setShopsLoading(true);
        try {
            const res = await authedFetch('/api/sadova/shops');
            const data: unknown = await res.json().catch(() => null);

            if (!res.ok) {
                throw new Error(extractApiError(data, `HTTP ${res.status}`));
            }

            const payload = data && typeof data === 'object' ? (data as ApiObject) : null;
            const isSuccess = payload?.success === true;
            const fetchedShops = isSuccess && Array.isArray(payload?.shops) ? (payload.shops as SadovaShop[]) : [];

            if (!isSuccess) {
                throw new Error(extractApiError(payload, 'Failed to load shops'));
            }

            setShops(fetchedShops);
            setSelectedShops(fetchedShops.map((s) => s.spot_id));
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            setLastRunMessage(`Error loading shops: ${message}`);
            setShops([]);
            setSelectedShops([]);
        } finally {
            setShopsLoading(false);
        }
    }, [authedFetch, extractApiError]);

    const fetchResults = useCallback(async () => {
        setTableLoading(true);
        try {
            const res = await authedFetch('/api/sadova/distribution/results');
            const raw: unknown = await res.json().catch(() => null);

            if (!res.ok) {
                throw new Error(extractApiError(raw, `HTTP ${res.status}`));
            }

            const rows = Array.isArray(raw)
                ? (raw as SadovaResult[])
                : raw && typeof raw === 'object' && Array.isArray((raw as ApiObject).data)
                    ? ((raw as { data: SadovaResult[] }).data || [])
                    : [];

            setTableData(rows);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            setLastRunMessage(`Error loading results: ${message}`);
            setTableData([]);
        } finally {
            setTableLoading(false);
        }
    }, [authedFetch, extractApiError]);

    const handleRefresh = useCallback(() => {
        void fetchResults();
    }, [fetchResults]);

    useEffect(() => {
        void fetchShops();
        void fetchResults();
    }, [fetchShops, fetchResults]);

    const handleRunDistribution = async () => {
        if (loading || shopsLoading || shops.length === 0) return;
        setLoading(true);
        setLastRunMessage(null);
        try {
            if (selectedShops.length === 0) throw new Error('Select at least one shop');
            const allSelected = selectedShops.length === shops.length;

            const res = await authedFetch('/api/sadova/distribution/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shop_ids: allSelected ? null : selectedShops }),
            });
            const raw: unknown = await res.json().catch(() => null);
            if (!res.ok) throw new Error(extractApiError(raw, `HTTP ${res.status}`));

            const data = (raw || {}) as SadovaRunResponse;
            if (!data.success) throw new Error(data.error || 'Distribution run failed');

            let msg = `Batch ${String(data.batch_id || '').slice(0, 8)} · Products ${data.products_processed || 0} · Weight ${data.total_kg || 0} kg`;
            if (data.live_sync?.partial_sync) msg += ' · Partial sync';

            setLastRunMessage(msg);
            await fetchResults();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            setLastRunMessage(`Error: ${message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async () => {
        if (tableData.length === 0) return;
        try {
            const exportData = tableData.map((row) => ({
                Product: row.product_name,
                Shop: row.spot_name,
                Quantity: row.quantity_to_ship,
                Date: row.business_date,
                StockNow: row.stock_now ?? '',
                MinStock: row.min_stock ?? '',
                AvgSales: row.avg_sales_day ?? '',
            }));
            await generateDistributionExcel(exportData, 'Sadova');
            setLastRunMessage('Excel export created');
        } catch {
            setLastRunMessage('Export failed');
        }
    };

    return (
        <div className="relative flex h-full w-full flex-col gap-6 overflow-hidden rounded-3xl bg-slate-100 p-6 text-slate-900">
            <header className="shrink-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                    <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                            <Truck size={12} /> Distribution (Sadova)
                        </div>
                        <h1 className="mt-3 text-3xl font-bold text-slate-900">Produced Goods Distribution</h1>
                        <p className="mt-3 text-sm leading-6 text-slate-600">Shop balances and product cards are shown in the table below.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:min-w-[460px]">
                        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">Shops</div>
                            <div className="mt-2 text-2xl font-bold text-indigo-700">{selectedShops.length}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Products</div>
                            <div className="mt-2 text-2xl font-bold text-slate-900">{summary.uniqueProducts}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Total kg</div>
                            <div className="mt-2 text-2xl font-bold text-slate-900">{summary.totalKg.toFixed(0)}</div>
                        </div>
                    </div>
                </div>
            </header>

            <section className="grid shrink-0 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Current split</div>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Distributed</div>
                            <div className="mt-1 text-2xl font-bold text-slate-900">{summary.distributedKg.toFixed(0)}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Warehouse left</div>
                            <div className="mt-1 text-2xl font-bold text-slate-900">{summary.warehouseFreeKg.toFixed(0)}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Active shops</div>
                            <div className="mt-1 text-2xl font-bold text-slate-900">{summary.uniqueShops}</div>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    {!shopsLoading && (
                        <ShopSelector shops={shops} selectedShops={selectedShops} setSelectedShops={setSelectedShops} />
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleRunDistribution}
                            disabled={loading || shopsLoading || shops.length === 0}
                            className={cn(
                                'inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors',
                                loading ? 'cursor-not-allowed bg-slate-200 text-slate-500' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                            )}
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                            Run distribution
                        </button>

                        <button
                            onClick={handleExport}
                            disabled={tableData.length === 0 || loading}
                            className={cn(
                                'inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-colors',
                                tableData.length === 0 || loading
                                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            )}
                        >
                            <Send className="h-4 w-4" />
                            Export Excel
                        </button>
                    </div>

                    <AnimatePresence>
                        {lastRunMessage && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className={cn(
                                    'mt-4 rounded-xl border px-4 py-3 text-sm',
                                    lastRunMessage.startsWith('Error') ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    {!lastRunMessage.startsWith('Error') && <CheckCircle2 size={16} />}
                                    <span>{lastRunMessage}</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </section>

            <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                {tableLoading && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-indigo-600" />
                        <p className="text-sm font-semibold text-slate-700">Refreshing...</p>
                    </div>
                )}

                {!tableLoading && tableData.length === 0 && (
                    <div className="flex flex-1 flex-col items-center justify-center text-slate-500">
                        <ShoppingBag className="mb-4 h-14 w-14 opacity-30" />
                        <p className="text-sm font-semibold uppercase tracking-[0.18em]">No data</p>
                    </div>
                )}

                {tableData.length > 0 && (
                    <div className="flex-1 overflow-auto">
                        <table className="w-full border-collapse text-left">
                            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white">
                                <tr>
                                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">#</th>
                                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Product</th>
                                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Shop</th>
                                    <th className="px-5 py-4 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Stock</th>
                                    <th className="px-5 py-4 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Min stock</th>
                                    <th className="px-5 py-4 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Avg sales</th>
                                    <th className="px-5 py-4 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">To ship</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableData
                                    .slice()
                                    .sort((a, b) => a.product_name.localeCompare(b.product_name, 'uk'))
                                    .map((row, idx) => (
                                        <tr key={`${row.id}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50">
                                            <td className="px-5 py-3 text-sm text-slate-500">{idx + 1}</td>
                                            <td className="px-5 py-3 text-sm font-semibold text-slate-900">{row.product_name}</td>
                                            <td className={cn('px-5 py-3 text-sm', row.spot_name === WAREHOUSE_ROW_NAME ? 'font-semibold text-amber-700' : 'text-slate-700')}>
                                                {row.spot_name}
                                            </td>
                                            <td className="px-5 py-3 text-right text-sm text-slate-600">{row.stock_now != null ? Number(row.stock_now).toFixed(2) : '-'}</td>
                                            <td className="px-5 py-3 text-right text-sm text-slate-600">{row.min_stock != null ? Number(row.min_stock).toFixed(0) : '-'}</td>
                                            <td className="px-5 py-3 text-right text-sm text-slate-600">{row.avg_sales_day != null ? Number(row.avg_sales_day).toFixed(2) : '-'}</td>
                                            <td className="px-5 py-3 text-right">
                                                <span className="inline-flex min-w-[4rem] justify-center rounded-lg bg-slate-900 px-3 py-1 text-sm font-semibold text-white">
                                                    {row.quantity_to_ship}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-600">
                            Rows: <strong className="text-slate-900">{summary.rows}</strong>
                        </div>
                        <button
                            onClick={handleRefresh}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Refresh
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
};
