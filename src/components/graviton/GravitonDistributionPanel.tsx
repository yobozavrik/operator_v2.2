'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, RefreshCw, ShoppingBag, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateDistributionExcel } from '@/lib/distribution-export';

interface GravitonResult {
    'Название продукта': string;
    'Магазин': string;
    'Количество': number;
    'Факт. залишок'?: number | null;
    'Мін. залишок'?: number | null;
    'Сер. продажі'?: number | null;
    'Борг'?: number | null;
    'Время расчета'?: string;
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

type BatchMeta = {
    batch_id: string;
    business_date: string;
    full_run: boolean;
    selected_shop_ids: number[] | null;
    products_processed: number;
    total_kg: number;
    debt_applied?: {
        rows_with_debt: number;
        total_debt_kg: number;
    };
    live_sync?: {
        stocks_rows: number;
        manufactures_rows: number;
        partial_sync: boolean;
        failed_storages: number[];
    };
};

export type ProductionSnapshotItem = {
    productId: string;
    productName: string;
    quantityKg: number;
};

export type GravitonDistributionPanelHandle = {
    runDistribution: (shopIds?: number[] | null) => Promise<void>;
    exportExcel: (deliveredSpotIds?: number[]) => Promise<void>;
    isRunDisabled: boolean;
    isExportDisabled: boolean;
    isRunLoading: boolean;
};

interface Props {
    onActionStateChange?: (state: {
        isRunDisabled: boolean;
        isExportDisabled: boolean;
        isRunLoading: boolean;
        productionItems: ProductionSnapshotItem[];
        productionTotalKg: number;
        distributedKg: number;
        warehouseFreeKg: number;
        uniqueShops: number;
    }) => void;
}

const WAREHOUSE_REMAINDER_LABEL = 'Вільні залишки на складі';
const WAREHOUSE_SOURCE_LABEL = 'Остаток на Складе';

export const GravitonDistributionPanel = forwardRef<GravitonDistributionPanelHandle, Props>(
    function GravitonDistributionPanel({ onActionStateChange }, ref) {
        const [loading, setLoading] = useState(false);
        const [tableLoading, setTableLoading] = useState(false);
        const [shopsLoading, setShopsLoading] = useState(true);
        const [tableData, setTableData] = useState<GravitonResult[]>([]);
        const [shops, setShops] = useState<GravitonShop[]>([]);
        const [lastRunMessage, setLastRunMessage] = useState<string | null>(null);
        const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
        const [currentBatchMeta, setCurrentBatchMeta] = useState<BatchMeta | null>(null);
        const [productionItems, setProductionItems] = useState<ProductionSnapshotItem[]>([]);

        const isRunDisabled = loading || shopsLoading || shops.length === 0;
        const isExportDisabled = tableData.length === 0 || loading;

        const summary = useMemo(() => {
            const distributedKg = tableData
                .filter((row) => row['Магазин'] !== WAREHOUSE_REMAINDER_LABEL)
                .reduce((sum, row) => sum + Number(row['Количество'] || 0), 0);
            const warehouseFreeKg = tableData
                .filter((row) => row['Магазин'] === WAREHOUSE_REMAINDER_LABEL)
                .reduce((sum, row) => sum + Number(row['Количество'] || 0), 0);
            const uniqueShops = new Set(
                tableData
                    .map((row) => row['Магазин'])
                    .filter((name) => name && name !== WAREHOUSE_REMAINDER_LABEL)
            ).size;

            return {
                rows: tableData.length,
                distributedKg,
                warehouseFreeKg,
                uniqueShops,
            };
        }, [tableData]);

        const productionTotalKg = useMemo(
            () => productionItems.reduce((sum, item) => sum + item.quantityKg, 0),
            [productionItems]
        );

        useEffect(() => {
            onActionStateChange?.({
                isRunDisabled,
                isExportDisabled,
                isRunLoading: loading,
                productionItems,
                productionTotalKg,
                distributedKg: summary.distributedKg,
                warehouseFreeKg: summary.warehouseFreeKg,
                uniqueShops: summary.uniqueShops,
            });
        }, [
            isRunDisabled,
            isExportDisabled,
            loading,
            onActionStateChange,
            productionItems,
            productionTotalKg,
            summary.distributedKg,
            summary.uniqueShops,
            summary.warehouseFreeKg,
        ]);

        const normalizeStoreName = (name: string) =>
            name.toLowerCase().replace(/магазин\s*/gi, '').replace(/["'«»]/g, '').trim();

        const fetchShops = async () => {
            setShopsLoading(true);
            try {
                const res = await fetch('/api/graviton/shops');
                const data = await res.json();
                if (!data.success) throw new Error(data.error || 'Failed to fetch shops');
                setShops(data.shops || []);
            } catch (err) {
                console.error('Error fetching shops:', err);
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
                setTableData((data || []) as GravitonResult[]);
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

                const batchRows = ((data as DistributionResultRow[]) || []);
                if (batchRows.length === 0) {
                    setTableData([]);
                    setProductionItems([]);
                    return;
                }

                const businessDate = batchRows[0].business_date;

                const { data: prodData, error: prodError } = await supabase
                    .schema('graviton')
                    .from('distribution_input_production')
                    .select('product_id, product_name, quantity')
                    .eq('batch_id', batchId);

                if (prodError) console.error('Error fetching production snapshot:', prodError);

                const productionMap = new Map<string, ProductionSnapshotItem>();
                ((prodData as any[]) || []).forEach((row) => {
                    if (!row.product_id) return;
                    const existing = productionMap.get(row.product_id);
                    if (existing) {
                        existing.quantityKg += Number(row.quantity || 0);
                    } else {
                        productionMap.set(row.product_id, {
                            productId: row.product_id,
                            productName: row.product_name,
                            quantityKg: Number(row.quantity || 0),
                        });
                    }
                });

                const nextProductionItems = Array.from(productionMap.values())
                    .sort((a, b) => b.quantityKg - a.quantityKg);
                setProductionItems(nextProductionItems);

                const uniqueProductIds = Array.from(new Set(batchRows.map((row) => row.product_id)));
                const spotNameToId: Record<string, number> = {};
                shops.forEach((shop) => {
                    spotNameToId[normalizeStoreName(shop.spot_name)] = shop.spot_id;
                });

                const uniqueSpotIds = Array.from(
                    new Set(
                        batchRows
                            .filter((row) => row.spot_name !== WAREHOUSE_SOURCE_LABEL)
                            .map((row) => spotNameToId[normalizeStoreName(row.spot_name)])
                            .filter((id): id is number => id !== undefined)
                    )
                );

                const { data: stockData, error: stockError } = await supabase
                    .schema('graviton')
                    .from('distribution_input_stocks')
                    .select('spot_id, product_id, stock_left')
                    .eq('batch_id', batchId);

                if (stockError) console.error('Error fetching stock snapshot:', stockError);

                let salesDataRaw: Record<string, any>[] = [];
                if (uniqueSpotIds.length > 0 && uniqueProductIds.length > 0) {
                    const { data: salesDataResult, error: salesError } = await supabase
                        .schema('graviton')
                        .from('distribution_base')
                        .select('*')
                        .in('код_продукту', uniqueProductIds)
                        .in('код_магазину', uniqueSpotIds);

                    if (salesError) console.error('Error fetching sales data:', salesError);
                    salesDataRaw = (salesDataResult || []) as Record<string, any>[];
                }

                // Борг по магазинах
                const { data: debtData } = await supabase
                    .schema('graviton')
                    .from('delivery_debt')
                    .select('spot_id, product_id, debt_kg')
                    .gt('debt_kg', 0);

                const debtMap: Record<string, number> = {};
                (debtData || []).forEach((d: any) => {
                    const k = `${d.spot_id}_${d.product_id}`;
                    debtMap[k] = (debtMap[k] || 0) + Number(d.debt_kg);
                });

                const stockMap: Record<string, number> = {};
                (stockData || []).forEach((row: any) => {
                    stockMap[`${row.spot_id}_${row.product_id}`] = row.stock_left;
                });

                const salesMap: Record<string, number> = {};
                const minStockMap: Record<string, number> = {};
                salesDataRaw.forEach((row) => {
                    const key = `${row['код_магазину']}_${row['код_продукту']}`;
                    salesMap[key] = row.avg_sales_day;
                    minStockMap[key] = row.min_stock;
                });

                const mappedData: GravitonResult[] = batchRows
                    .filter((row) => row.spot_name !== WAREHOUSE_SOURCE_LABEL)
                    .map((row) => {
                        const spotId = spotNameToId[normalizeStoreName(row.spot_name)];
                        const key = spotId ? `${spotId}_${row.product_id}` : '';

                        return {
                            'Название продукта': row.product_name,
                            'Магазин': row.spot_name,
                            'Факт. залишок': key ? stockMap[key] ?? null : null,
                            'Мін. залишок': key ? minStockMap[key] ?? null : null,
                            'Сер. продажі': key ? salesMap[key] ?? null : null,
                            'Борг': key ? (debtMap[key] ?? null) : null,
                            'Количество': row.quantity_to_ship,
                            'Время расчета': row.business_date,
                        };
                    });

                const distributedMap: Record<string, number> = {};
                batchRows.forEach((row) => {
                    if (row.spot_name !== WAREHOUSE_SOURCE_LABEL) {
                        distributedMap[row.product_id] = (distributedMap[row.product_id] || 0) + row.quantity_to_ship;
                    }
                });

                const remainderRows: GravitonResult[] = [];
                nextProductionItems.forEach((item) => {
                    const distributedQty = distributedMap[item.productId] || 0;
                    const remainingQty = Math.floor(item.quantityKg) - distributedQty;
                    if (remainingQty > 0) {
                        remainderRows.push({
                            'Название продукта': item.productName,
                            'Магазин': WAREHOUSE_REMAINDER_LABEL,
                            'Количество': remainingQty,
                            'Время расчета': businessDate,
                        });
                    }
                });

                const finalData = [...mappedData, ...remainderRows].sort((a, b) => {
                    if (a['Название продукта'] < b['Название продукта']) return -1;
                    if (a['Название продукта'] > b['Название продукта']) return 1;
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

        const runDistribution = async (shopIds?: number[] | null) => {
            if (isRunDisabled) return;

            setLoading(true);
            setLastRunMessage(null);
            try {
                const normalizedShopIds =
                    Array.isArray(shopIds) && shopIds.length > 0 && shopIds.length < shops.length
                        ? shopIds
                        : null;

                const res = await fetch('/api/graviton/distribution/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ shop_ids: normalizedShopIds }),
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
                setCurrentBatchMeta(data as BatchMeta);
                await fetchBatchTableData(data.batch_id);
            } catch (err: any) {
                console.error('Error running graviton calc:', err);
                setLastRunMessage(`Помилка: ${err.message}`);
            } finally {
                setLoading(false);
            }
        };

        const exportExcel = async (deliveredSpotIds?: number[]) => {
            if (isExportDisabled) return;
            try {
                let exportData = tableData;
                if (deliveredSpotIds && deliveredSpotIds.length > 0 && deliveredSpotIds.length < shops.length) {
                    const norm = (name: string) =>
                        name.toLowerCase().replace(/магазин\s*/gi, '').replace(/["'«»]/g, '').trim();
                    const deliveredNorm = new Set(
                        shops
                            .filter((s) => deliveredSpotIds.includes(s.spot_id))
                            .map((s) => norm(s.spot_name))
                    );
                    exportData = tableData.filter(
                        (row) =>
                            row['Магазин'] === WAREHOUSE_REMAINDER_LABEL ||
                            deliveredNorm.has(norm(row['Магазин']))
                    );
                }
                await generateDistributionExcel(exportData);
                const skipped = shops.length - (deliveredSpotIds?.length ?? shops.length);
                setLastRunMessage(
                    skipped > 0
                        ? `Excel сформовано: ${deliveredSpotIds?.length} магазинів, ${skipped} пропущено`
                        : 'Excel успішно сформовано'
                );
            } catch (err) {
                console.error('Export error:', err);
                setLastRunMessage('Помилка експорту');
            }
        };

        useImperativeHandle(
            ref,
            () => ({
                runDistribution,
                exportExcel,
                isRunDisabled,
                isExportDisabled,
                isRunLoading: loading,
            }),
            [isRunDisabled, isExportDisabled, loading, tableData]
        );

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
                                Нижче тільки результат розподілу: що поїхало по магазинах, які залишки вільні на складі і які позиції потрапили в поточний run.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:min-w-[460px]">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Розподілено</div>
                                <div className="mt-2 text-2xl font-bold text-slate-900">{summary.distributedKg.toFixed(0)} кг</div>
                                <div className="mt-2 text-xs text-slate-600">Обсяг, який уже пішов по магазинах у поточному run</div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Вільний залишок</div>
                                <div className="mt-2 text-2xl font-bold text-slate-900">{summary.warehouseFreeKg.toFixed(0)} кг</div>
                                <div className="mt-2 text-xs text-slate-600">Що лишилося на складі після run</div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Магазини в розподілі</div>
                                <div className="mt-2 text-2xl font-bold text-slate-900">{summary.uniqueShops}</div>
                                <div className="mt-2 text-xs text-slate-600">Точки, які отримали позиції в поточному run</div>
                            </div>
                        </div>
                    </div>
                </header>

                {lastRunMessage && (
                    <section className={cn(
                        'shrink-0 rounded-2xl border px-4 py-3 text-sm shadow-sm',
                        lastRunMessage.startsWith('Помилка')
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    )}>
                        {lastRunMessage}
                    </section>
                )}

                <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                    {currentBatchMeta && (
                        <div className="shrink-0 border-b border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
                                    <span
                                        className={cn(
                                            'rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                                            currentBatchMeta.full_run ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                        )}
                                    >
                                        {currentBatchMeta.full_run ? 'Повний розрахунок' : 'Частковий розрахунок'}
                                    </span>
                                    <span>Партія: <strong>{currentBatchMeta.batch_id.slice(0, 8)}</strong></span>
                                    <span>Дата: <strong>{currentBatchMeta.business_date}</strong></span>
                                    <span>Позицій: <strong>{currentBatchMeta.products_processed}</strong></span>
                                    <span>Вага: <strong>{currentBatchMeta.total_kg} кг</strong></span>
                                    {currentBatchMeta.debt_applied && currentBatchMeta.debt_applied.rows_with_debt > 0 && (
                                        <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">
                                            Борг враховано: {currentBatchMeta.debt_applied.total_debt_kg} кг · {currentBatchMeta.debt_applied.rows_with_debt} рядків
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => {
                                        setCurrentBatchId(null);
                                        setCurrentBatchMeta(null);
                                        setProductionItems([]);
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
                            <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900" />
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
                                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white">
                                    <tr>
                                        <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">#</th>
                                        <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Позиція</th>
                                        <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Магазин</th>
                                        <th className="px-5 py-4 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Фактичний залишок</th>
                                        <th className="px-5 py-4 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Мінімальний залишок</th>
                                        <th className="px-5 py-4 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Сер. продажі</th>
                                        <th className="px-5 py-4 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">До відправки</th>
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
                                            <td
                                                className={cn(
                                                    'px-5 py-3 text-sm',
                                                    row['Магазин'] === WAREHOUSE_REMAINDER_LABEL ? 'font-semibold text-amber-700' : 'text-slate-700'
                                                )}
                                            >
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

                    <div className="shrink-0 flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
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
    }
);
