import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';
import { ProductionTask } from '@/types/bi';

interface StoreProductCardProps {
    item: ProductionTask;
}

export const StoreProductCard = ({ item }: StoreProductCardProps) => {
    const storeData = item.stores[0];
    if (!storeData) return null;

    const currentStock = storeData.currentStock || 0;
    const minStock = storeData.minStock || 0;
    const recommended = storeData.deficitKg > 0 ? storeData.deficitKg : (storeData.recommendedKg || 0);
    const avgSales = storeData.avgSales || 0;
    const delta = Math.max(0, minStock - currentStock);

    const isCritical = recommended > 0 || currentStock <= minStock;

    return (
        <div
            className={cn(
                'rounded-2xl border bg-white p-4 text-slate-900 shadow-sm transition-colors',
                isCritical ? 'border-red-200' : 'border-slate-200'
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className={cn(
                        'inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                        isCritical ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                    )}>
                        {isCritical ? 'Дефіцит' : 'Норма'}
                    </div>
                    <div className="mt-2 text-sm font-semibold leading-5 text-slate-900" title={item.name}>
                        {item.name}
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">До заявки</div>
                    <div className={cn('mt-1 text-2xl font-bold leading-none', isCritical ? 'text-red-700' : 'text-slate-700')}>
                        {recommended.toFixed(1)}
                    </div>
                    <div className="text-[11px] text-slate-500">кг</div>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">Факт</div>
                    <div className={cn('mt-1 flex items-center gap-1 text-lg font-bold', currentStock <= minStock ? 'text-red-700' : 'text-slate-900')}>
                        {currentStock.toFixed(0)}
                        {storeData.isLive === false && (
                            <span title="Дані з бази, без онлайн-синхронізації" className="text-amber-500">
                                <AlertCircle size={12} />
                            </span>
                        )}
                    </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">Мінімум</div>
                    <div className="mt-1 text-lg font-bold text-slate-900">{minStock.toFixed(0)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">Сер. продаж</div>
                    <div className="mt-1 text-lg font-bold text-slate-900">{avgSales.toFixed(1)}</div>
                </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">Що відбувається</div>
                <div className="mt-1 text-sm text-slate-700">
                    {delta > 0
                        ? `До мінімального залишку не вистачає ${delta.toFixed(1)} кг. Позицію варто додавати в заявку.`
                        : recommended > 0
                            ? `Мінімум уже прикритий, але позиція ще входить у рекомендований добір.`
                            : 'Позиція виглядає стабільною, термінове втручання не потрібне.'}
                </div>
            </div>
        </div>
    );
};
