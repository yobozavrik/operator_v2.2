import React, { useState, useMemo, useEffect } from 'react';
import { ProductionTask } from '@/types/bi';
import { StoreProductCard } from './graviton/StoreProductCard';
import { X, Store, ArrowRight, AlertTriangle, Layers3, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

interface Props {
    queue: ProductionTask[];
    storeName: string;
}

const StoreSignal = ({
    icon: Icon,
    label,
    value,
    note,
    tone = 'neutral'
}: {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    value: string;
    note?: string;
    tone?: 'neutral' | 'critical';
}) => (
    <div className={cn(
        'rounded-2xl border bg-white p-4 shadow-sm',
        tone === 'critical' ? 'border-red-200' : 'border-slate-200'
    )}>
        <div className={cn(
            'mb-3 inline-flex rounded-xl p-2',
            tone === 'critical' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'
        )}>
            <Icon size={16} />
        </div>
        <div className={cn('text-[10px] uppercase tracking-[0.18em] font-bold', tone === 'critical' ? 'text-red-700' : 'text-slate-500')}>
            {label}
        </div>
        <div className={cn('mt-2 text-2xl font-bold leading-none', tone === 'critical' ? 'text-red-700' : 'text-slate-900')}>
            {value}
        </div>
        {note ? <div className="mt-2 text-xs leading-5 text-slate-600">{note}</div> : null}
    </div>
);

export const StoreSpecificView = ({ queue, storeName }: Props) => {
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const categoriesMap = useMemo(() => {
        const map = new Map<string, {
            categoryName: string;
            items: ProductionTask[];
            totalKg: number;
            totalFact: number;
            itemsCount: number;
        }>();

        queue.forEach(item => {
            let cat = 'Інше';
            const nameLower = item.name.toLowerCase();

            if (nameLower.includes('вареники')) cat = 'Вареники';
            else if (nameLower.includes('млинці')) cat = 'Млинці';
            else if (nameLower.includes('котлети')) cat = 'Котлети';
            else if (nameLower.includes('сирники')) cat = 'Сирники';
            else if (nameLower.includes('хінкалі')) cat = 'Хінкалі';
            else if (nameLower.includes('пельмені')) cat = 'Пельмені';
            else if (nameLower.includes('зрази')) cat = 'Зрази';
            else if (nameLower.includes('ковбас')) cat = 'Ковбаси';
            else if (nameLower.includes('голубці')) cat = 'Голубці';
            else if (nameLower.includes('деруни')) cat = 'Деруни';
            else if (nameLower.includes('м\'ясо') || nameLower.includes('куряч')) cat = 'М\'ясні вироби';

            if (!map.has(cat)) {
                map.set(cat, {
                    categoryName: cat,
                    items: [],
                    totalKg: 0,
                    totalFact: 0,
                    itemsCount: 0
                });
            }

            const c = map.get(cat)!;
            c.items.push(item);
            c.itemsCount += 1;
            c.totalKg += item.recommendedQtyKg || 0;
            c.totalFact += item.stores[0]?.currentStock || 0;
        });

        return Array.from(map.values())
            .filter(c => c.itemsCount > 0)
            .sort((a, b) => b.totalKg - a.totalKg);
    }, [queue]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedCategory(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const selectedCategoryData = useMemo(() => {
        if (!selectedCategory) return null;
        return categoriesMap.find(c => c.categoryName === selectedCategory) || null;
    }, [selectedCategory, categoriesMap]);

    const totalStoreKg = useMemo(() => categoriesMap.reduce((sum, c) => sum + c.totalKg, 0), [categoriesMap]);
    const criticalCategories = useMemo(() => categoriesMap.filter(c => c.totalKg > 0).length, [categoriesMap]);
    const topCategory = useMemo(() => categoriesMap[0] || null, [categoriesMap]);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-[#F8FAFC] text-slate-900">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white">
                <div className="px-6 py-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                                <Store size={12} /> Магазин
                            </div>
                            <h2 className="mt-3 text-2xl font-bold text-slate-900">{storeName}</h2>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                                Спочатку дивись категорії з найбільшим дефіцитом, потім відкривай товари й добирай позиції в заявку.
                            </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-right">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">Сумарно до заявки</div>
                            <div className="mt-2 text-3xl font-bold text-slate-900">{totalStoreKg.toFixed(0)} кг</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-6 py-4">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">Сценарій роботи</div>
                        <div className="mt-2 text-lg font-semibold text-slate-900">Категорія → позиції → перевірка → заявка</div>
                        <div className="mt-2 text-sm text-slate-600">Не переглядай усе підряд. Починай з найбільшого дефіциту і рухайся зверху вниз.</div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <StoreSignal icon={AlertTriangle} label="Категорій з дефіцитом" value={`${criticalCategories}`} tone="critical" />
                        <StoreSignal icon={Layers3} label="Усього до заявки" value={`${totalStoreKg.toFixed(0)} кг`} />
                        <StoreSignal icon={Target} label="Головна категорія" value={topCategory ? `${topCategory.totalKg.toFixed(0)} кг` : '—'} note={topCategory?.categoryName} />
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {categoriesMap.map((category) => {
                        const hasDeficit = category.totalKg > 0;

                        return (
                            <button
                                key={category.categoryName}
                                onClick={() => setSelectedCategory(category.categoryName)}
                                className={cn(
                                    'rounded-2xl border p-4 text-left shadow-sm transition-colors',
                                    hasDeficit
                                        ? 'border-red-200 bg-white hover:border-red-300 hover:bg-red-50/30'
                                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className={cn(
                                            'inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                                            hasDeficit ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
                                        )}>
                                            {hasDeficit ? 'Критично' : 'Стабільно'}
                                        </div>
                                        <h3 className="mt-3 text-lg font-bold text-slate-900">{category.categoryName}</h3>
                                        <div className="mt-1 text-sm text-slate-600">{category.itemsCount} позицій</div>
                                    </div>
                                    <ArrowRight size={18} className={cn(hasDeficit ? 'text-red-600' : 'text-slate-400')} />
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">До заявки</div>
                                        <div className={cn('mt-1 text-2xl font-bold', hasDeficit ? 'text-red-700' : 'text-slate-900')}>
                                            {category.totalKg.toFixed(0)} кг
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">Факт</div>
                                        <div className="mt-1 text-2xl font-bold text-slate-900">{category.totalFact.toFixed(0)}</div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <AnimatePresence>
                {selectedCategory && selectedCategoryData && (
                    <motion.div
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 lg:p-8 pl-72"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) setSelectedCategory(null);
                        }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            initial={{ scale: 0.98, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.98, opacity: 0 }}
                            className="flex max-h-[90vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-6 border-b border-slate-200 px-6 py-5 shrink-0">
                                <div>
                                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">Магазин</div>
                                    <h2 className="mt-2 text-2xl font-bold text-slate-900">{selectedCategoryData.categoryName} / {selectedCategoryData.itemsCount} поз.</h2>
                                    <p className="mt-2 text-sm text-slate-600">Переглянь товари в категорії, починаючи з найбільшого дефіциту.</p>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">До заявки</div>
                                        <div className="mt-1 text-2xl font-bold text-red-700">{selectedCategoryData.totalKg.toFixed(0)} кг</div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedCategory(null)}
                                        className="rounded-xl border border-slate-200 bg-white p-3 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
