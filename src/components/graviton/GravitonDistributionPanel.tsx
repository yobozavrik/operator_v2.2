import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Play, Loader2, RefreshCw, ShoppingBag, CheckCircle2, Send, Truck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { generateDistributionExcel } from '@/lib/distribution-export';
import { ShopSelector } from '../ShopSelector';

interface GravitonResult {
    "Название продукта": string;
    "Магазин": string;
    "Количество": number;
    "Факт. залишок"?: number | null;
    "Мін. залишок"?: number | null;
    "Сер. продажі"?: number | null;
    "Время расчета"?: string;
}

interface GravitonShop {
    spot_id: number;
    storage_id: number;
    spot_name: string;
}

interface DistributionResultRow {
    product_id: string;
    product_name: string;
    spot_name: string;
    quantity_to_ship: number;
    calculation_batch_id: string;
    business_date: string;
}

export const GravitonDistributionPanel = () => {
    const [loading, setLoading] = useState(false);
    const [tableData, setTableData] = useState<GravitonResult[]>([]);
    const [shops, setShops] = useState<GravitonShop[]>([]);
    const [shopsLoading, setShopsLoading] = useState(true);
    const [selectedShops, setSelectedShops] = useState<number[]>([]);
    const [tableLoading, setTableLoading] = useState(false);
    const [lastRunMessage, setLastRunMessage] = useState<string | null>(null);
    const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
    const [currentBatchMeta, setCurrentBatchMeta] = useState<{
        batch_id: string;
        business_date: string;
        full_run: boolean;
        selected_shop_ids: number[] | null;
        products_processed: number;
        total_kg: number;
        live_sync?: {
            stocks_rows: number;
            manufactures_rows: number;
            partial_sync: boolean;
            failed_storages: number[];
        };
    } | null>(null);

    const summary = useMemo(() => {
        const uniqueProducts = new Set(tableData.map(row => row['Название продукта'])).size;
        const totalKg = tableData.reduce((sum, row) => sum + Number(row['Количество'] || 0), 0);
        const distributedKg = tableData
            .filter(row => row['Магазин'] !== 'Вільні залишки на складі')
            .reduce((sum, row) => sum + Number(row['Количество'] || 0), 0);
        const warehouseFreeKg = tableData
            .filter(row => row['Магазин'] === 'Вільні залишки на складі')
            .reduce((sum, row) => sum + Number(row['Количество'] || 0), 0);
        const uniqueShops = new Set(
            tableData
                .map(row => row['Магазин'])
                .filter(name => name && name !== 'Вільні залишки на складі')
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

    const fetchShops = async () => {
        setShopsLoading(true);
        try {
            const res = await fetch('/api/graviton/shops');
            const data = await res.json();
            if (data.success) {
                const fetchedShops = data.shops || [];
                setShops(fetchedShops);
                setSelectedShops(fetchedShops.map((s: GravitonShop) => s.spot_id));
            } else {
                throw new Error(data.error || 'Failed to fetch shops');
            }
        } catch (err) {
            console.error('Error fetching shops:', err);
            setLastRunMessage('Помилка завантаження магазинів');
        } finally {
            setShopsLoading(false);
        }
    };

    const fetchPublicTableData = async () => {
        setTableLoading(true);
        try {
            const { data, error } = await supabase
                .from('v_graviton_results_public')
                .select('*')
                .order('Название продукта', { ascending: true });

            if (error) throw error;
            setTableData(data || []);
        } catch (err) {
            console.error('Error fetching public graviton results:', err);
        } finally {
            setTableLoading(false);
        }
    };

    const fetchBatchTableData = async (batchId: string) => {
        setTableLoading(true);
        try {
            const { data, error } = await supabase
                .schema('graviton')
                .from('distribution_results')
                .select('product_id, product_name, spot_name, quantity_to_ship, calculation_batch_id, business_date')
                .eq('calculation_batch_id', batchId)
                .order('product_name', { ascending: true })
                .order('spot_name', { ascending: true });

            if (error) throw error;

            const batchRows = data as DistributionResultRow[] || [];
            if (batchRows.length === 0) {
                setTableData([]);
                return;
            }

            const businessDate = batchRows[0].business_date;

            const { data: prodData, error: prodError } = await supabase
                .schema('graviton')
                .from('distribution_input_production')
                .select('product_id, product_name, quantity')
                .eq('batch_id', batchId);

            if (prodError) {
                console.error('Error fetching production snapshot:', prodError);
            }

            const uniqueProductIds = Array.from(new Set(batchRows.map(r => r.product_id)));
            const normalizeStoreName = (name: string) => name.toLowerCase().replace(/магазин\s*/g, '').replace(/["'«»]/g, '').trim();
            const spotNameToId: Record<string, number> = {};
            shops.forEach(s => {
                spotNameToId[normalizeStoreName(s.spot_name)] = s.spot_id;
            });

            const uniqueSpotIds = Array.from(new Set(
                batchRows
                    .filter(row => row.spot_name !== 'Остаток на Складе')
                    .map(row => spotNameToId[normalizeStoreName(row.spot_name)])
                    .filter(id => id !== undefined)
            ));

            const { data: stockData, error: stockError } = await supabase
                .schema('graviton')
                .from('distribution_input_stocks')
                .select('spot_id, product_id, stock_left')
                .eq('batch_id', batchId);

            if (stockError) console.error('Error fetching stock snapshot:', stockError);

            let salesDataRaw: any[] = [];
            if (uniqueSpotIds.length > 0 && uniqueProductIds.length > 0) {
                const { data: salesDataResult, error: salesError } = await supabase
                    .schema('graviton')
                    .from('distribution_base')
                    .select('*')
                    .in('код_продукту', uniqueProductIds)
                    .in('код_магазину', uniqueSpotIds);

                if (salesError) console.error('Error fetching sales data:', salesError);
                salesDataRaw = salesDataResult || [];
            }

            const stockMap: Record<string, number> = {};
            (stockData || []).forEach((row: any) => {
                stockMap[`${row.spot_id}_${row.product_id}`] = row.stock_left;
            });

            const salesMap: Record<string, number> = {};
            const minStockMap: Record<string, number> = {};
            (salesDataRaw as any[] || []).forEach(row => {
                const key = `${row.код_магазину}_${row.код_продукту}`;
                salesMap[key] = row.avg_sales_day;
                minStockMap[key] = row.min_stock;
            });

            const mappedData: GravitonResult[] = batchRows
                .filter(row => row.spot_name !== 'Остаток на Складе')
                .map(row => {
                    const sId = spotNameToId[normalizeStoreName(row.spot_name)];
                    const pId = row.product_id;
                    const stock = sId && pId ? stockMap[`${sId}_${pId}`] : null;
                    const minStock = sId && pId ? minStockMap[`${sId}_${pId}`] : null;
                    const sales = sId && pId ? salesMap[`${sId}_${pId}`] : null;

                    return {
                        'Название продукта': row.product_name,
                        'Магазин': row.spot_name,
                        'Факт. залишок': stock !== undefined ? stock : null,
                        'Мін. залишок': minStock !== undefined ? minStock : null,
                        'Сер. продажі': sales !== undefined ? sales : null,
                        'Количество': row.quantity_to_ship,
                        'Время расчета': row.business_date
                    };
                });

            const distributedMap: Record<string, number> = {};
            batchRows.forEach(row => {
                if (row.spot_name !== 'Остаток на Складе') {
                    distributedMap[row.product_id] = (distributedMap[row.product_id] || 0) + row.quantity_to_ship;
                }
            });

            const productionMap: Record<string, number> = {};
            const productNamesMap: Record<string, string> = {};
            (prodData as any[] || []).forEach(row => {
                if (row.product_id) {
                    productionMap[row.product_id] = (productionMap[row.product_id] || 0) + row.quantity;
                    productNamesMap[row.product_id] = row.product_name;
                }
            });

            const remainderRows: GravitonResult[] = [];
            for (const [prodId, prodQty] of Object.entries(productionMap)) {
                const distributed = distributedMap[prodId] || 0;
                const remaining = Math.floor(prodQty) - distributed;
                if (remaining > 0) {
                    remainderRows.push({
                        'Название продукта': productNamesMap[prodId] || 'Невідома позиція',
                        'Магазин': 'Вільні залишки на складі',
                        'Количество': remaining,
                        'Время расчета': businessDate
                    });
                }
            }

            const finalData = [...mappedData, ...remainderRows].sort((a, b) => {
                const nameA = a['Название продукта'];
                const nameB = b['Название продукта'];
                if (nameA < nameB) return -1;
                if (nameA > nameB) return 1;
                return a['Магазин'].localeCompare(b['Магазин']);
            });

            setTableData(finalData);
        } catch (err) {
            console.error(`Error fetching batch results for ${batchId}:`, err);
        } finally {
            setTableLoading(false);
        }
    };

    const handleRefresh = () => {
        if (currentBatchId) {
            fetchBatchTableData(currentBatchId);
        } else {
            fetchPublicTableData();
        }
    };

    useEffect(() => {
        fetchShops();
        fetchPublicTableData();
    }, []);

    const handleRunDistribution = async () => {
        if (loading || shopsLoading || shops.length === 0) return;

        setLoading(true);
        setLastRunMessage(null);
        try {
            if (selectedShops.length === 0) {
                throw new Error('Оберіть хоча б один магазин');
            }

            const allSelected = selectedShops.length === shops.length;

            const res = await fetch('/api/graviton/distribution/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shop_ids: allSelected ? null : selectedShops })
            });
            const data = await res.json();

            if (!data.success) {
                throw new Error(data.error || 'Помилка виконання розподілу');
            }

            let msg = `Партія ${data.batch_id?.slice(0, 8)} · Позицій ${data.products_processed} · Вага ${data.total_kg} кг`;
            if (data.live_sync?.partial_sync) {
                msg += ' · Часткова синхронізація';
            }

            setLastRunMessage(msg);
            setCurrentBatchId(data.batch_id);
            setCurrentBatchMeta(data);
            await fetchBatchTableData(data.batch_id);
        } catch (err: any) {
            console.error('Error running graviton calc:', err);
            setLastRunMessage(`Помилка: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async () => {
        if (tableData.length === 0) return;
        try {
            await generateDistributionExcel(tableData);
            setLastRunMessage('Файл успішно сформовано');
        } catch (err) {
            console.error('Export error:', err);
            setLastRunMessage('Помилка експорту');
        }
    };

    return (
        <div className="relative flex h-full w-full flex-col gap-6 overflow-hidden rounded-3xl bg-slate-100 p-6 text-slate-900">
            <header className="shrink-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                    <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                            <Truck size={12} /> Розподіл
                        </div>
                        <h1 className="mt-3 text-3xl font-bold text-slate-900">Розподіл виробленої продукції</h1>
                        <p className="mt-3 text-sm leading-6 text-slate-600">
                            Тут формується розподіл готової продукції, яку вже виготовило виробництво: обери магазини, запусти розрахунок і перевір, що пішло по магазинах, а що залишилось на складі.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:min-w-[460px]">
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-red-700">Магазинів</div>
                            <div className="mt-2 text-2xl font-bold text-red-700">{selectedShops.length}</div>
                            <div className="mt-2 text-xs text-slate-600">Скільки точок входить у поточний розрахунок</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500">Позицій</div>
                            <div className="mt-2 text-2xl font-bold text-slate-900">{summary.uniqueProducts}</div>
                            <div className="mt-2 text-xs text-slate-600">Скільки унікальних позицій у таблиці результату</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500">Загальний обсяг</div>
                            <div className="mt-2 text-2xl font-bold text-slate-900">{summary.totalKg.toFixed(0)} кг</div>
                            <div className="mt-2 text-xs text-slate-600">Сумарний обсяг поточного розподілу</div>
                        </div>
                    </div>
                </div>
            </header>

            <section className="grid shrink-0 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500">Що зараз розподіляємо</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">Готову продукцію, яку виробництво вже випустило</div>
                    <div className="mt-2 text-sm text-slate-600">Після розрахунку тут має бути зрозуміло, скільки вже розподілено по магазинах і скільки ще лишається вільним залишком на складі.</div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500">Розподілено</div>
                            <div className="mt-1 text-2xl font-bold text-slate-900">{summary.distributedKg.toFixed(0)} кг</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500">Вільний залишок</div>
                            <div className="mt-1 text-2xl font-bold text-slate-900">{summary.warehouseFreeKg.toFixed(0)} кг</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500">Магазини в розподілі</div>
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
                                loading
                                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                    : 'bg-slate-900 text-white hover:bg-slate-800'
                            )}
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                            Сформувати розподіл
                        </button>

                        <button
                            onClick={handleExport}
                            disabled={tableData.length === 0 || loading}
                            className={cn(
                                'inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-colors',
                                tableData.length === 0 || loading
                                    ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            )}
                        >
                            <Send className="h-4 w-4" />
                            Відправити файл
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
                                    lastRunMessage.startsWith('Помилка')
                                        ? 'border-red-200 bg-red-50 text-red-700'
                                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    {!lastRunMessage.startsWith('Помилка') && <CheckCircle2 size={16} />}
                                    <span>{lastRunMessage}</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </section>

            <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                {currentBatchMeta && (
                    <div className="border-b border-slate-200 bg-slate-50 p-4 shrink-0">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
                                <span className={cn(
                                    'rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                                    currentBatchMeta.full_run ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                )}>
                                    {currentBatchMeta.full_run ? 'Повний розрахунок' : 'Частковий розрахунок'}
                                </span>
                                <span>Партія: <strong>{currentBatchMeta.batch_id.slice(0, 8)}</strong></span>
                                <span>Дата: <strong>{currentBatchMeta.business_date}</strong></span>
                                <span>Позицій: <strong>{currentBatchMeta.products_processed}</strong></span>
                                <span>Вага: <strong>{currentBatchMeta.total_kg} кг</strong></span>
                            </div>
                            <button
                                onClick={() => {
                                    setCurrentBatchId(null);
                                    setCurrentBatchMeta(null);
                                    fetchPublicTableData();
                                }}
                                className="text-sm font-medium text-slate-600 hover:text-slate-900"
                            >
                                Повернутись до загальної вітрини
                            </button>
                        </div>
                    </div>
                )}

                {tableLoading && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                        <div className="mb-4 h-10 w-10 rounded-full border-4 border-slate-300 border-t-slate-900 animate-spin" />
                        <p className="text-sm font-semibold text-slate-700">Рахуємо розподіл…</p>
                    </div>
                )}

                {!tableLoading && tableData.length === 0 && (
                    <div className="flex flex-1 flex-col items-center justify-center text-slate-500">
                        <ShoppingBag className="mb-4 h-14 w-14 opacity-30" />
                        <p className="text-sm font-semibold uppercase tracking-[0.18em]">Розподіл ще не сформовано</p>
                    </div>
                )}

                {tableData.length > 0 && (
                    <div className="flex-1 overflow-auto">
                        <table className="w-full border-collapse text-left">
                            <thead className="sticky top-0 z-10 bg-white border-b border-slate-200">
                                <tr>
                                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">#</th>
                                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Позиція</th>
                                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Магазин</th>
                                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 text-right">Фактичний залишок</th>
                                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 text-right">Мінімальний залишок</th>
                                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 text-right">Сер. продажі</th>
                                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 text-right">До відправки</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableData.map((row, idx) => (
                                    <tr
                                        key={`${row['Название продукта']}-${row['Магазин']}-${idx}`}
                                        className="border-b border-slate-100 hover:bg-slate-50"
                                    >
                                        <td className="px-5 py-3 text-sm text-slate-500">{idx + 1}</td>
                                        <td className="px-5 py-3 text-sm font-semibold text-slate-900">{row['Название продукта']}</td>
                                        <td className={cn('px-5 py-3 text-sm', row['Магазин'] === 'Вільні залишки на складі' ? 'font-semibold text-amber-700' : 'text-slate-700')}>
                                            {row['Магазин']}
                                        </td>
                                        <td className="px-5 py-3 text-right text-sm text-slate-600">
                                            {row['Факт. залишок'] != null ? Number(row['Факт. залишок']).toFixed(2) : '—'}
                                        </td>
                                        <td className="px-5 py-3 text-right text-sm text-slate-600">
                                            {row['Мін. залишок'] != null ? Number(row['Мін. залишок']).toFixed(0) : '—'}
                                        </td>
                                        <td className="px-5 py-3 text-right text-sm text-slate-600">
                                            {row['Сер. продажі'] != null ? Number(row['Сер. продажі']).toFixed(2) : '—'}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <span className="inline-flex min-w-[5rem] justify-center rounded-lg bg-slate-900 px-3 py-1 text-sm font-semibold text-white">
                                                {row['Количество']}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 shrink-0">
                    <div className="text-sm text-slate-600">
                        Рядків: <strong className="text-slate-900">{summary.rows}</strong> · Магазинів: <strong className="text-slate-900">{summary.uniqueShops}</strong>
                    </div>
                    <button
                        onClick={handleRefresh}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        title="Оновити"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Оновити
                    </button>
                </div>
            </section>
        </div>
    );
};
