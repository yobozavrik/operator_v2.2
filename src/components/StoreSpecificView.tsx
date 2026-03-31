import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Layers3 } from 'lucide-react';
import { ProductionTask } from '@/types/bi';
import { StoreProductCard } from './graviton/StoreProductCard';
import { cn } from '@/lib/utils';

interface Props {
    queue: ProductionTask[];
    storeName: string;
}

type StoreCategory = {
    categoryName: string;
    items: ProductionTask[];
    totalKg: number;
    criticalItems: number;
    itemsCount: number;
};

export const StoreSpecificView = ({ queue, storeName }: Props) => {
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const categories = useMemo<StoreCategory[]>(() => {
        const categoryMap = new Map<string, StoreCategory>();

        queue.forEach((item) => {
            const categoryName = item.category || 'Інше';
            const store = item.stores[0];
            if (!store) return;

            if (!categoryMap.has(categoryName)) {
                categoryMap.set(categoryName, {
                    categoryName,
                    items: [],
                    totalKg: 0,
                    criticalItems: 0,
                    itemsCount: 0,
                });
            }

            const entry = categoryMap.get(categoryName)!;
            entry.items.push(item);
            entry.totalKg += item.recommendedQtyKg || 0;
            entry.itemsCount += 1;
            if ((store.deficitKg || 0) > 0 || store.currentStock <= 0) {
                entry.criticalItems += 1;
            }
        });

        return Array.from(categoryMap.values()).sort((a, b) => b.totalKg - a.totalKg);
    }, [queue]);

    const selectedCategoryData = useMemo(
        () => categories.find((category) => category.categoryName === selectedCategory) || null,
        [categories, selectedCategory]
    );

    const summary = useMemo(() => {
        const totalKg = categories.reduce((sum, category) => sum + category.totalKg, 0);
        const criticalItems = queue.reduce((sum, item) => {
            const store = item.stores[0];
            return sum + (((store?.deficitKg || 0) > 0 || (store?.currentStock || 0) <= 0) ? 1 : 0);
        }, 0);
        const topCategory = categories[0];

        return {
            totalKg,
            criticalItems,
            topCategoryName: topCategory?.categoryName || '—',
            topCategoryKg: topCategory?.totalKg || 0,
        };
    }, [categories, queue]);

    return (
        <div className="flex h-full flex-col gap-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Магазин</div>
                        <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{storeName.replace('Магазин ', '')}</h2>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                            Спочатку дивись категорії з найбільшим дефіцитом, потім відкривай позиції та добирай потрібні SKU в заявку.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link
                            href="/graviton"
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                        >
                            Назад до огляду
                        </Link>
                        <button
                            type="button"
                            onClick={() => setSelectedCategory(categories[0]?.categoryName || null)}
                            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                        >
                            Перейти до вибору позицій
                            <ArrowRight size={16} />
                        </button>
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-700">Критичних позицій</div>
                        <div className="mt-2 text-3xl font-bold text-red-700">{summary.criticalItems}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">До заявки</div>
                        <div className="mt-2 text-3xl font-bold text-slate-900">{summary.totalKg.toFixed(0)} кг</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Головна категорія</div>
                        <div className="mt-2 text-lg font-bold text-slate-900">{summary.topCategoryName}</div>
                        <div className="mt-1 text-sm text-slate-500">{summary.topCategoryKg.toFixed(0)} кг</div>
                    </div>
                </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Категорії магазину</div>
                    <h3 className="mt-2 text-xl font-bold text-slate-900">Що болить у точці зараз</h3>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {categories.map((category) => {
                        const critical = category.criticalItems > 0;

                        return (
                            <button
                                key={category.categoryName}
                                type="button"
                                onClick={() => setSelectedCategory(category.categoryName)}
                                className={cn(
                                    'rounded-2xl border p-5 text-left shadow-sm transition-colors',
                                    critical
                                        ? 'border-red-200 bg-red-50/40 hover:bg-red-50'
                                        : 'border-slate-200 bg-slate-50 hover:bg-white'
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div
                                            className={cn(
                                                'inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                                                critical ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
                                            )}
                                        >
                                            {critical ? 'Критично' : 'До перегляду'}
                                        </div>
                                        <div className="mt-3 text-lg font-bold text-slate-900">{category.categoryName}</div>
                                        <div className="mt-2 text-sm text-slate-600">{category.itemsCount} позиції</div>
                                    </div>
                                    {critical ? <AlertTriangle size={18} className="text-red-700" /> : <Layers3 size={18} className="text-slate-400" />}
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">До заявки</div>
                                        <div className="mt-1 text-2xl font-bold text-slate-900">{category.totalKg.toFixed(0)} кг</div>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Критичних SKU</div>
                                        <div className="mt-1 text-2xl font-bold text-slate-900">{category.criticalItems}</div>
                                    </div>
                                </div>

                                <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-3">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Наступна дія</div>
                                    <div className="mt-1 text-sm text-slate-700">Відкрити категорію та перейти до вибору позицій</div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </section>

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
                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Категорія магазину</div>
                                    <h3 className="mt-2 text-2xl font-bold text-slate-900">
                                        {selectedCategoryData.categoryName} / {selectedCategoryData.itemsCount} позиції
                                    </h3>
                                    <p className="mt-2 text-sm text-slate-600">Починай з позицій, де вже є дефіцит або нульовий фактичний залишок.</p>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">До заявки</div>
                                    <div className="mt-1 text-2xl font-bold text-slate-900">{selectedCategoryData.totalKg.toFixed(0)} кг</div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                    {selectedCategoryData.items.map((item) => (
                                        <StoreProductCard key={item.id} item={item} />
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
