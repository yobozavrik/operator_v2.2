'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Factory, Loader2, Play, RotateCw, Send, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductionSnapshotItem } from '@/components/graviton/GravitonDistributionPanel';

type DebtRow = {
    spot_id: number;
    spot_name: string;
    product_id: number;
    product_name: string;
    debt_kg: number;
    updated_at: string;
};

type DeliveryState = {
    success: boolean;
    date: string;
    pending_distribution: unknown[];
    accumulated_debt: DebtRow[];
    active_shop_ids: number[];
};

type ShopItem = {
    spot_id: number;
    storage_id: number;
    spot_name: string;
};

interface Props {
    onRunDistribution?: (shopIds: number[] | null) => void;
    onExportExcel?: (deliveredSpotIds: number[]) => void;
    runDisabled?: boolean;
    exportDisabled?: boolean;
    runLoading?: boolean;
    productionItems?: ProductionSnapshotItem[];
    productionTotalKg?: number;
    distributedKg?: number;
    warehouseFreeKg?: number;
    uniqueShops?: number;
}

const KYIV_DATE = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());

export function GravitonDeliveryConfirm({
    onRunDistribution,
    onExportExcel,
    runDisabled = false,
    exportDisabled = false,
    runLoading = false,
    productionItems = [],
    productionTotalKg = 0,
    distributedKg = 0,
    warehouseFreeKg = 0,
    uniqueShops = 0,
}: Props) {
    const [shops, setShops] = useState<ShopItem[]>([]);
    const [state, setState] = useState<DeliveryState | null>(null);
    const [selectedDate] = useState<string>(KYIV_DATE);
    const [deliveredSpotIds, setDeliveredSpotIds] = useState<number[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const loadData = async (date = selectedDate) => {
        setLoading(true);
        setMessage(null);
        try {
            const [shopsRes, confirmRes] = await Promise.all([
                fetch('/api/graviton/shops'),
                fetch(`/api/graviton/confirm-delivery?date=${date}`),
            ]);

            const shopsJson = await shopsRes.json();
            const confirmJson = await confirmRes.json();

            if (!shopsRes.ok || !shopsJson.success) {
                throw new Error(shopsJson.error || 'Не вдалося завантажити магазини');
            }
            if (!confirmRes.ok || !confirmJson.success) {
                throw new Error(confirmJson.error || 'Не вдалося завантажити стан доставки');
            }

            const fetchedShops: ShopItem[] = shopsJson.shops || [];
            setShops(fetchedShops);
            setState(confirmJson);
            // Delivery confirmation must reflect the factual route, not auto-select
            // every active shop by default. Otherwise users can confirm "all
            // delivered" without explicitly marking the real recipients.
            setDeliveredSpotIds([]);
        } catch (error: any) {
            setMessage(error.message || 'Помилка завантаження доставки');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData(selectedDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate]);

    const debtByShop = useMemo(() => {
        const map = new Map<string, number>();
        (state?.accumulated_debt || []).forEach((row) => {
            map.set(row.spot_name, (map.get(row.spot_name) || 0) + Number(row.debt_kg || 0));
        });
        return map;
    }, [state]);

    const totalDebtKg = useMemo(
        () => Array.from(debtByShop.values()).reduce((sum, value) => sum + value, 0),
        [debtByShop]
    );

    const topProductionItems = productionItems.slice(0, 8);

    const toggleShop = (spotId: number) => {
        setDeliveredSpotIds((current) =>
            current.includes(spotId) ? current.filter((id) => id !== spotId) : [...current, spotId]
        );
    };

    const handleConfirm = async () => {
        setSubmitting(true);
        setMessage(null);
        try {
            const response = await fetch('/api/graviton/confirm-delivery', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    business_date: selectedDate,
                    delivered_spot_ids: deliveredSpotIds,
                }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Не вдалося підтвердити доставку');
            }

            const undeliveredCount = Math.max(0, shops.length - deliveredSpotIds.length);
            setMessage(`Доставку підтверджено: ${deliveredSpotIds.length} магазинів. Борг нараховано: ${undeliveredCount} магазинів.`);
            await loadData(selectedDate);
        } catch (error: any) {
            setMessage(error.message || 'Помилка підтвердження');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-5">
                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                                <Factory size={12} />
                                Виготовлено зараз
                            </div>
                            {productionTotalKg > 0 && (
                                <div className="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white">
                                    {productionTotalKg.toFixed(0)} кг
                                </div>
                            )}
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Розподілено</div>
                                <div className="mt-1 text-2xl font-bold text-slate-900">{distributedKg.toFixed(0)} кг</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Вільний залишок</div>
                                <div className="mt-1 text-2xl font-bold text-slate-900">{warehouseFreeKg.toFixed(0)} кг</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Магазини в розподілі</div>
                                <div className="mt-1 text-2xl font-bold text-slate-900">{uniqueShops}</div>
                            </div>
                        </div>

                        <div className="mt-4">
                            {topProductionItems.length > 0 ? (
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                    {topProductionItems.map((item) => (
                                        <div
                                            key={item.productId}
                                            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                                        >
                                            <div className="min-w-0 pr-4 text-sm font-semibold text-slate-900">{item.productName}</div>
                                            <div className="whitespace-nowrap text-sm font-bold text-slate-700">{item.quantityKg.toFixed(0)} кг</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                                    Спочатку сформуй розподіл, щоб підтягнути актуальний перелік виготовленої продукції.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                                <Truck size={12} />
                                Підтвердження доставки
                            </div>
                            {totalDebtKg > 0 && (
                                <div className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">
                                    Борг: {totalDebtKg.toFixed(1)} кг
                                </div>
                            )}
                        </div>

                        <p className="mt-3 text-sm leading-6 text-slate-600">
                            Познач магазини, які фізично отримали товар сьогодні. Розподіл рахується по всій активній мережі, а цей чек-ліст впливає тільки на підтвердження доставки й накопичення боргу.
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Link
                                href="/graviton/debt"
                                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100"
                            >
                                <Truck size={15} />
                                Відкрити борг
                            </Link>
                            <button
                                type="button"
                                onClick={() => loadData(selectedDate)}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                            >
                                <RotateCw size={15} />
                                Змінити
                            </button>
                            <button
                                type="button"
                                onClick={() => setDeliveredSpotIds(shops.map((shop) => shop.spot_id))}
                                disabled={shops.length === 0}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                            >
                                Обрати всі
                            </button>
                            <button
                                type="button"
                                onClick={() => setDeliveredSpotIds([])}
                                disabled={deliveredSpotIds.length === 0}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                            >
                                Зняти всі
                            </button>
                        </div>

                        <div className="mt-4 text-sm text-slate-700">
                            Отримало: <span className="font-semibold text-slate-900">{deliveredSpotIds.length}</span> /{' '}
                            <span className="font-semibold text-slate-900">{shops.length}</span> магазинів
                        </div>

                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-col gap-4">
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Дії рейсу</div>
                                    <div className="mt-2 text-sm text-slate-600">
                                        Спочатку перерахуй повний розподіл, потім перевір фактичні точки доставки і підтвердь рейс.
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => onRunDistribution?.(null)}
                                        disabled={runDisabled}
                                        className={cn(
                                            'inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors',
                                            runDisabled
                                                ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                                                : 'bg-slate-900 text-white hover:bg-slate-800'
                                        )}
                                    >
                                        {runLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} className="fill-current" />}
                                        Сформувати розподіл по мережі
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => onExportExcel?.(deliveredSpotIds)}
                                        disabled={exportDisabled}
                                        className={cn(
                                            'inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-colors',
                                            exportDisabled
                                                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                        )}
                                    >
                                        <Send size={16} />
                                        Завантажити Excel
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleConfirm}
                                        disabled={submitting || loading}
                                        className={cn(
                                            'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors',
                                            submitting || loading ? 'bg-slate-200 text-slate-500' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                        )}
                                    >
                                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                        Підтвердити доставку
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-8 text-slate-500">
                        <Loader2 size={18} className="mr-2 animate-spin" />
                        Завантаження доставки…
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {shops.map((shop) => {
                            const checked = deliveredSpotIds.includes(shop.spot_id);
                            const debtKg = debtByShop.get(shop.spot_name) || 0;

                            return (
                                <button
                                    key={shop.spot_id}
                                    type="button"
                                    onClick={() => toggleShop(shop.spot_id)}
                                    className={cn(
                                        'rounded-2xl border px-4 py-4 text-left transition-colors',
                                        checked
                                            ? 'border-emerald-200 bg-emerald-50'
                                            : debtKg > 0
                                                ? 'border-red-200 bg-red-50'
                                                : 'border-slate-200 bg-white hover:bg-slate-50'
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-slate-900">{shop.spot_name}</div>
                                            {!checked && debtKg > 0 && (
                                                <div className="mt-1 text-xs font-semibold text-red-600">Борг: {debtKg.toFixed(0)} кг</div>
                                            )}
                                        </div>
                                        <div
                                            className={cn(
                                                'flex h-5 w-5 items-center justify-center rounded-md border',
                                                checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-red-300 bg-white text-transparent'
                                            )}
                                        >
                                            <CheckCircle2 size={12} />
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {message && (
                    <div
                        className={cn(
                            'rounded-xl border px-4 py-3 text-sm',
                            message.includes('Помилка') || message.includes('не вдалося')
                                ? 'border-red-200 bg-red-50 text-red-700'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        )}
                    >
                        {message}
                    </div>
                )}
            </div>
        </section>
    );
}
