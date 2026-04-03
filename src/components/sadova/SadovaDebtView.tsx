'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Package, RefreshCw, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';

type DebtRow = {
    spot_id: number;
    spot_name: string;
    product_id: number;
    product_name: string;
    debt_kg: number;
    updated_at: string;
};

type PendingRow = {
    spot_name: string;
    product_id: number;
    product_name: string;
    quantity_to_ship: number;
    delivery_status: string;
};

type DeliveryState = {
    success: boolean;
    date: string;
    pending_distribution: PendingRow[];
    accumulated_debt: DebtRow[];
    active_shop_ids: number[];
};

const KYIV_DATE = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());

export function SadovaDebtView() {
    const [data, setData] = useState<DeliveryState | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const response = await fetch(`/api/sadova/confirm-delivery?date=${KYIV_DATE()}`);
            const json = await response.json();
            if (!response.ok || !json.success) {
                throw new Error(json.error || 'Не вдалося завантажити борг доставки');
            }
            setData(json);
        } catch (error: any) {
            setMessage(error.message || 'Помилка завантаження');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const groupedDebt = useMemo(() => {
        const byShop = new Map<
            string,
            {
                spotId: number;
                shopName: string;
                totalKg: number;
                updatedAt: string;
                items: Array<{ productId: number; productName: string; debtKg: number }>;
            }
        >();

        (data?.accumulated_debt || []).forEach((row) => {
            const current = byShop.get(row.spot_name) || {
                spotId: row.spot_id,
                shopName: row.spot_name,
                totalKg: 0,
                updatedAt: row.updated_at,
                items: [],
            };

            current.totalKg += Number(row.debt_kg || 0);
            current.updatedAt = row.updated_at > current.updatedAt ? row.updated_at : current.updatedAt;
            current.items.push({
                productId: row.product_id,
                productName: row.product_name,
                debtKg: Number(row.debt_kg || 0),
            });

            byShop.set(row.spot_name, current);
        });

        return Array.from(byShop.values())
            .map((shop) => ({
                ...shop,
                totalKg: Number(shop.totalKg.toFixed(3)),
                items: shop.items.sort((a, b) => b.debtKg - a.debtKg),
            }))
            .sort((a, b) => b.totalKg - a.totalKg);
    }, [data]);

    const pendingByShop = useMemo(() => {
        const map = new Map<string, { totalKg: number; items: PendingRow[] }>();
        (data?.pending_distribution || []).forEach((row) => {
            const current = map.get(row.spot_name) || { totalKg: 0, items: [] };
            current.totalKg += Number(row.quantity_to_ship || 0);
            current.items.push(row);
            map.set(row.spot_name, current);
        });
        return map;
    }, [data]);

    const totalDebtKg = useMemo(
        () => groupedDebt.reduce((sum, shop) => sum + shop.totalKg, 0),
        [groupedDebt]
    );

    const totalPendingKg = useMemo(
        () =>
            Array.from(pendingByShop.values()).reduce((sum, shop) => sum + Number(shop.totalKg || 0), 0),
        [pendingByShop]
    );

    return (
        <div className="flex h-full flex-col gap-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                    <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                            <Truck size={12} />
                            Борг доставки
                        </div>
                        <h2 className="mt-3 text-3xl font-bold text-slate-900">Накопичений борг по магазинах</h2>
                        <p className="mt-3 text-sm leading-6 text-slate-600">
                            Тут окремо видно, що не доїхало раніше, і що зараз очікує підтвердження доставки. Це той самий owner-source, що використовує блок підтвердження доставки.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={loadData}
                        disabled={loading}
                        className={cn(
                            'inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors',
                            loading ? 'bg-slate-200 text-slate-500' : 'bg-slate-900 text-white hover:bg-slate-800'
                        )}
                    >
                        <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
                        Оновити
                    </button>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-700">Борг усього</div>
                        <div className="mt-2 text-3xl font-bold text-red-700">{totalDebtKg.toFixed(0)} кг</div>
                    </div>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">Очікує підтвердження</div>
                        <div className="mt-2 text-3xl font-bold text-amber-700">{totalPendingKg.toFixed(0)} кг</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Магазини з боргом</div>
                        <div className="mt-2 text-3xl font-bold text-slate-900">{groupedDebt.length}</div>
                    </div>
                </div>
            </section>

            {message && (
                <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
                    {message}
                </section>
            )}

            {loading ? (
                <section className="flex h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center gap-3 text-slate-500">
                        <Loader2 size={18} className="animate-spin" />
                        Завантаження боргу доставки…
                    </div>
                </section>
            ) : (
                <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="flex items-center gap-2 text-slate-900">
                            <AlertTriangle size={18} className="text-red-600" />
                            <h3 className="text-xl font-bold">Накопичений борг</h3>
                        </div>

                        <div className="mt-5 space-y-4">
                            {groupedDebt.length === 0 ? (
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-sm text-emerald-800">
                                    Активного боргу немає.
                                </div>
                            ) : (
                                groupedDebt.map((shop) => (
                                    <div key={shop.shopName} className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <div className="text-lg font-bold text-slate-900">{shop.shopName}</div>
                                                <div className="mt-1 text-sm text-slate-600">
                                                    Позицій: {shop.items.length} · Оновлено: {new Date(shop.updatedAt).toLocaleString('uk-UA')}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-700">Борг</div>
                                                <div className="mt-1 text-2xl font-bold text-red-700">{shop.totalKg.toFixed(0)} кг</div>
                                            </div>
                                        </div>

                                        <div className="mt-4 space-y-2">
                                            {shop.items.map((item) => (
                                                <div
                                                    key={`${shop.spotId}-${item.productId}`}
                                                    className="flex items-center justify-between rounded-xl border border-red-200 bg-white px-4 py-3"
                                                >
                                                    <div className="min-w-0 pr-4 text-sm font-semibold text-slate-900">{item.productName}</div>
                                                    <div className="whitespace-nowrap text-sm font-bold text-red-700">{item.debtKg.toFixed(1)} кг</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="flex items-center gap-2 text-slate-900">
                            <Package size={18} className="text-amber-600" />
                            <h3 className="text-xl font-bold">Поточне pending по рейсу</h3>
                        </div>

                        <div className="mt-5 space-y-4">
                            {pendingByShop.size === 0 ? (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                                    На сьогодні pending-розподілу немає.
                                </div>
                            ) : (
                                Array.from(pendingByShop.entries())
                                    .sort((a, b) => b[1].totalKg - a[1].totalKg)
                                    .map(([shopName, shop]) => (
                                        <div key={shopName} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="text-lg font-bold text-slate-900">{shopName}</div>
                                                <div className="text-right">
                                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">Pending</div>
                                                    <div className="mt-1 text-2xl font-bold text-amber-700">{shop.totalKg.toFixed(0)} кг</div>
                                                </div>
                                            </div>

                                            <div className="mt-4 space-y-2">
                                                {shop.items
                                                    .sort((a, b) => Number(b.quantity_to_ship || 0) - Number(a.quantity_to_ship || 0))
                                                    .map((item) => (
                                                        <div
                                                            key={`${shopName}-${item.product_id}`}
                                                            className="flex items-center justify-between rounded-xl border border-amber-200 bg-white px-4 py-3"
                                                        >
                                                            <div className="min-w-0 pr-4 text-sm font-semibold text-slate-900">{item.product_name}</div>
                                                            <div className="whitespace-nowrap text-sm font-bold text-amber-700">
                                                                {Number(item.quantity_to_ship || 0).toFixed(1)} кг
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    ))
                            )}
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}
