'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ChevronRight, ClipboardList, Package, Target, X } from 'lucide-react';
import { ProductionTask, PriorityKey } from '@/types/bi';
import { useStore } from '@/context/StoreContext';
import { OrderConfirmationModal } from './OrderConfirmationModal';
import { ShareOptionsModal } from './ShareOptionsModal';
import { OrderItem, SharePlatform } from '@/types/order';
import { cn } from '@/lib/utils';

interface Props {
    deficitQueue: ProductionTask[];
    allProductsQueue: ProductionTask[];
    refreshUrgency?: 'normal' | 'warning' | 'critical';
    onMetricsUpdate?: (metrics: { totalKg: number; criticalWeight: number; reserveWeight: number; criticalSKU: number; reserveSKU: number }) => void;
    onManualRefresh?: () => void;
    planningDays?: number;
    onPlanningDaysChange?: (days: number) => void;
}

type CategorySummary = {
    name: string;
    items: ProductionTask[];
    itemsCount: number;
    totalKg: number;
    priority: PriorityKey;
};

export const BIPowerMatrix = ({
    allProductsQueue,
    onMetricsUpdate,
    planningDays: controlledPlanningDays,
    onPlanningDaysChange,
}: Props) => {
    const { selectedStore, currentCapacity } = useStore();
    const [localPlanningDays, setLocalPlanningDays] = useState<number>(1);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedStores, setSelectedStores] = useState<Map<string, boolean>>(new Map());
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [showShiftRestrictionModal, setShowShiftRestrictionModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [orderData, setOrderData] = useState<any>(null);
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

    const planningDays = controlledPlanningDays ?? localPlanningDays;

    const handleSetPlanningDays = (days: number) => {
        if (onPlanningDaysChange) onPlanningDaysChange(days);
        else setLocalPlanningDays(days);
    };

    const filteredQueue = useMemo(() => {
        return allProductsQueue
            .map((item) => {
                const stores = item.stores
                    .filter((store) => {
                        if (selectedStore === 'Усі') return true;
                        return store.storeName === selectedStore;
                    })
                    .map((store) => {
                        const currentStock = Number(store.currentStock || 0);
                        const minStock = Number(store.minStock || 0);
                        const avgSales = Number(store.avgSales || 0);
                        const recommendedKg = selectedStore === 'Усі'
                            ? Math.max(0, Number((minStock + avgSales * Math.max(0, planningDays - 1) - currentStock).toFixed(1)))
                            : Math.max(0, Number((minStock - currentStock).toFixed(1)));

                        const deficitKg = Math.max(0, Number((minStock - currentStock).toFixed(1)));

                        return {
                            ...store,
                            recommendedKg,
                            deficitKg,
                        };
                    })
                    .filter((store) => store.recommendedKg > 0 || store.deficitKg > 0);

                if (stores.length === 0) return null;

                const recommendedQtyKg = Number(stores.reduce((sum, store) => sum + store.recommendedKg, 0).toFixed(1));
                const totalDeficitKg = Number(stores.reduce((sum, store) => sum + store.deficitKg, 0).toFixed(1));
                const priority: PriorityKey = totalDeficitKg > 0 ? 'critical' : 'reserve';

                return {
                    ...item,
                    stores,
                    recommendedQtyKg,
                    totalDeficitKg,
                    priority,
                } as ProductionTask;
            })
            .filter((item): item is ProductionTask => item !== null)
            .sort((a, b) => {
                if ((b.totalDeficitKg || 0) !== (a.totalDeficitKg || 0)) {
                    return (b.totalDeficitKg || 0) - (a.totalDeficitKg || 0);
                }
                return b.recommendedQtyKg - a.recommendedQtyKg;
            });
    }, [allProductsQueue, planningDays, selectedStore]);

    const categories = useMemo<CategorySummary[]>(() => {
        const categoryMap = new Map<string, CategorySummary>();

        filteredQueue.forEach((item) => {
            const name = item.category || 'Інше';
            if (!categoryMap.has(name)) {
                categoryMap.set(name, {
                    name,
                    items: [],
                    itemsCount: 0,
                    totalKg: 0,
                    priority: 'reserve',
                });
            }

            const category = categoryMap.get(name)!;
            category.items.push(item);
            category.itemsCount += 1;
            category.totalKg += item.recommendedQtyKg;
            if ((item.totalDeficitKg || 0) > 0) {
                category.priority = 'critical';
            }
        });

        return Array.from(categoryMap.values()).sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority === 'critical' ? -1 : 1;
            }
            return b.totalKg - a.totalKg;
        });
    }, [filteredQueue]);

    const selectedWeight = useMemo(() => {
        let total = 0;
        filteredQueue.forEach((item) => {
            item.stores.forEach((store) => {
                const key = `${item.productCode}_${store.storeName}`;
                if (selectedStores.has(key)) total += store.recommendedKg;
            });
        });
        return Number(total.toFixed(1));
    }, [filteredQueue, selectedStores]);

    useEffect(() => {
        if (!onMetricsUpdate) return;

        const criticalWeight = Number(filteredQueue.reduce((sum, item) => sum + (item.totalDeficitKg || 0), 0).toFixed(1));
        const criticalSKU = filteredQueue.filter((item) => (item.totalDeficitKg || 0) > 0).length;
        const totalKg = Number(filteredQueue.reduce((sum, item) => sum + item.recommendedQtyKg, 0).toFixed(1));
        const reserveWeight = Math.max(0, Number((totalKg - criticalWeight).toFixed(1)));
        const reserveSKU = Math.max(0, filteredQueue.length - criticalSKU);

        onMetricsUpdate({ totalKg, criticalWeight, reserveWeight, criticalSKU, reserveSKU });
    }, [filteredQueue, onMetricsUpdate]);

    const toggleStoreSelection = (productCode: number, storeName: string) => {
        const key = `${productCode}_${storeName}`;
        setSelectedStores((current) => {
            const next = new Map(current);
            if (next.has(key)) next.delete(key);
            else next.set(key, true);
            return next;
        });
    };

    const toggleSelectAllByCategory = (items: ProductionTask[]) => {
        const categoryKeys = items.flatMap((item) => item.stores.map((store) => `${item.productCode}_${store.storeName}`));
        const allSelected = categoryKeys.every((key) => selectedStores.has(key));

        setSelectedStores((current) => {
            const next = new Map(current);
            categoryKeys.forEach((key) => {
                if (allSelected) next.delete(key);
                else next.set(key, true);
            });
            return next;
        });
    };

    const selectAll = () => {
        const next = new Map<string, boolean>();
        filteredQueue.forEach((item) => {
            item.stores.forEach((store) => next.set(`${item.productCode}_${store.storeName}`, true));
        });
        setSelectedStores(next);
    };

    const clearSelection = () => setSelectedStores(new Map());

    const handleFormOrder = () => {
        if (currentCapacity === null) {
            setShowShiftRestrictionModal(true);
            return;
        }

        const items: OrderItem[] = [];
        filteredQueue.forEach((item) => {
            item.stores.forEach((store) => {
                const key = `${item.productCode}_${store.storeName}`;
                if (!selectedStores.has(key)) return;

                const quantity = Math.max(0, Number(store.recommendedKg.toFixed(1)));
                if (quantity <= 0) return;

                items.push({
                    id: key,
                    productCode: item.productCode,
                    productName: item.name,
                    category: item.category,
                    storeName: store.storeName,
                    quantity,
                    kg: quantity,
                    minRequired: store.deficitKg,
                    maxRecommended: store.recommendedKg,
                    priority: item.priority,
                });
            });
        });

        if (items.length === 0) {
            alert('Оберіть позиції для заявки');
            return;
        }

        const totalKg = Number(items.reduce((sum, item) => sum + item.kg, 0).toFixed(1));
        setOrderItems(items);
        setOrderData({ date: new Date().toLocaleDateString('uk-UA'), totalKg, items });
        setIsOrderModalOpen(true);
    };

    const handleConfirmOrder = (confirmedItems: OrderItem[]) => {
        setOrderItems(confirmedItems);
        setIsOrderModalOpen(false);
        setShowShareModal(true);
    };

    const handleShare = async (_platform: SharePlatform['id']) => {
        setShowShareModal(false);
        clearSelection();
    };

    const selectedCategoryData = useMemo(
        () => categories.find((category) => category.name === selectedCategory) || null,
        [categories, selectedCategory]
    );

    return (
        <div className="flex h-full flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Що запускати зараз</div>
                        <h3 className="mt-2 text-xl font-bold text-slate-900">Категорії до відбору</h3>
                        <p className="mt-1 text-sm text-slate-600">Відкрий категорію, познач позиції, потім сформуй заявку одним основним CTA.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {[1, 2, 3, 4, 7, 14].map((day) => (
                            <button
                                key={day}
                                type="button"
                                onClick={() => handleSetPlanningDays(day)}
                                className={cn(
                                    'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                                    planningDays === day
                                        ? 'border-slate-900 bg-slate-900 text-white'
                                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                )}
                            >
                                {day} д
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-700">Критично позицій</div>
                    <div className="mt-2 text-2xl font-bold text-red-700">{filteredQueue.filter((item) => (item.totalDeficitKg || 0) > 0).length}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Категорій у роботі</div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">{categories.length}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Обрано в заявку</div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">{selectedWeight.toFixed(0)} кг</div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {categories.map((category) => {
                    const critical = category.priority === 'critical';
                    return (
                        <button
                            key={category.name}
                            type="button"
                            onClick={() => setSelectedCategory(category.name)}
                            className={cn(
                                'rounded-2xl border p-5 text-left shadow-sm transition-colors',
                                critical
                                    ? 'border-red-200 bg-red-50/40 hover:bg-red-50'
                                    : 'border-slate-200 bg-white hover:bg-slate-50'
                            )}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className={cn(
                                        'inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                                        critical ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                                    )}>
                                        {critical ? 'Критично' : 'До перегляду'}
                                    </div>
                                    <div className="mt-3 text-lg font-bold text-slate-900">{category.name}</div>
                                    <div className="mt-2 text-sm text-slate-600">{category.itemsCount} позиції</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">До заявки</div>
                                    <div className="mt-1 text-2xl font-bold text-slate-900">{category.totalKg.toFixed(0)} кг</div>
                                </div>
                            </div>

                            <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3">
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Наступна дія</div>
                                    <div className="mt-1 text-sm text-slate-700">Відкрити деталі та обрати позиції</div>
                                </div>
                                <ChevronRight size={18} className="text-slate-400" />
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className="mt-auto grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
                <button
                    type="button"
                    onClick={selectAll}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white"
                >
                    Обрати все
                </button>
                <button
                    type="button"
                    onClick={clearSelection}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white"
                >
                    Очистити вибір
                </button>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Обрано</div>
                    <div className="mt-1 text-xl font-bold text-slate-900">{selectedWeight.toFixed(0)} кг</div>
                </div>
                <button
                    type="button"
                    onClick={handleFormOrder}
                    className={cn(
                        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors',
                        selectedStores.size > 0
                            ? 'bg-slate-900 text-white hover:bg-slate-800'
                            : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    )}
                >
                    <Package size={16} />
                    Сформувати заявку
                </button>
            </div>

            <AnimatePresence>
                {selectedCategoryData && (
                    <motion.div
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 lg:p-8"
                        onClick={(event) => {
                            if (event.target === event.currentTarget) setSelectedCategory(null);
                        }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            initial={{ scale: 0.98, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.98, opacity: 0 }}
                            className="flex max-h-[90vh] w-full max-w-[1480px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-6 border-b border-slate-200 px-6 py-5">
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Категорія</div>
                                    <h3 className="mt-2 text-2xl font-bold text-slate-900">
                                        {selectedCategoryData.name} / {selectedCategoryData.itemsCount} позиції
                                    </h3>
                                    <p className="mt-2 text-sm text-slate-600">Починай з позицій, де вже є дефіцит. Магазини показані рядком, без зайвої карточної вкладеності.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedCategory(null)}
                                    className="rounded-xl border border-slate-200 bg-white p-3 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-4">
                                <button
                                    type="button"
                                    onClick={() => toggleSelectAllByCategory(selectedCategoryData.items)}
                                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                >
                                    Обрати все в категорії
                                </button>
                                <div className="text-right">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">До заявки</div>
                                    <div className="mt-1 text-xl font-bold text-slate-900">{selectedCategoryData.totalKg.toFixed(0)} кг</div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto bg-white p-6">
                                <div className="space-y-4">
                                    {selectedCategoryData.items.map((item) => (
                                        <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                <div>
                                                    <div className="text-lg font-semibold text-slate-900">{item.name}</div>
                                                    <div className="mt-2 text-sm text-slate-600">{item.stores.length} магазини в доборі</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">До заявки</div>
                                                    <div className="mt-1 text-xl font-bold text-slate-900">{item.recommendedQtyKg.toFixed(1)} кг</div>
                                                </div>
                                            </div>

                                            <div className="mt-4 space-y-2">
                                                {item.stores.map((store) => {
                                                    const key = `${item.productCode}_${store.storeName}`;
                                                    const checked = selectedStores.has(key);
                                                    const critical = (store.deficitKg || 0) > 0;

                                                    return (
                                                        <button
                                                            key={key}
                                                            type="button"
                                                            onClick={() => toggleStoreSelection(item.productCode, store.storeName)}
                                                            className={cn(
                                                                'flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                                                                checked
                                                                    ? 'border-slate-900 bg-white'
                                                                    : 'border-slate-200 bg-white hover:bg-slate-50'
                                                            )}
                                                        >
                                                            <div className="flex items-start gap-3">
                                                                <div className={cn(
                                                                    'mt-0.5 flex h-5 w-5 items-center justify-center rounded border',
                                                                    checked ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-transparent'
                                                                )}>
                                                                    <CheckCircle2 size={12} />
                                                                </div>
                                                                <div>
                                                                    <div className="text-sm font-semibold text-slate-900">{store.storeName}</div>
                                                                    <div className="mt-1 text-xs text-slate-600">
                                                                        Фактичний залишок {store.currentStock.toFixed(0)} · Мінімум {store.minStock.toFixed(0)} · До заявки {store.recommendedKg.toFixed(1)} кг
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className={cn(
                                                                'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                                                                critical ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                                                            )}>
                                                                {critical ? 'Критично' : 'До перегляду'}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {showShiftRestrictionModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/35 p-4">
                    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
                        <div className="text-lg font-bold text-slate-900">Зміна не обрана</div>
                        <div className="mt-2 text-sm text-slate-600">Оберіть зміну в розділі персоналу, щоб сформувати заявку.</div>
                        <button
                            type="button"
                            onClick={() => setShowShiftRestrictionModal(false)}
                            className="mt-5 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                        >
                            Зрозуміло
                        </button>
                    </div>
                </div>
            )}

            <OrderConfirmationModal
                isOpen={isOrderModalOpen}
                items={orderItems}
                onClose={() => setIsOrderModalOpen(false)}
                onConfirm={handleConfirmOrder}
            />

            <ShareOptionsModal
                isOpen={showShareModal}
                items={orderItems}
                orderData={orderData}
                onClose={() => setShowShareModal(false)}
                onShare={handleShare}
            />
        </div>
    );
};
