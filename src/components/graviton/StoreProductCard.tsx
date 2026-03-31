import React from 'react';
import { AlertCircle } from 'lucide-react';
import { ProductionTask } from '@/types/bi';
import { cn } from '@/lib/utils';

interface StoreProductCardProps {
    item: ProductionTask;
}

export const StoreProductCard = ({ item }: StoreProductCardProps) => {
    const storeData = item.stores[0];
    if (!storeData) return null;

    const currentStock = storeData.currentStock || 0;
    const minStock = storeData.minStock || 0;
    const toOrder = storeData.deficitKg > 0 ? storeData.deficitKg : storeData.recommendedKg || 0;
    const isCritical = toOrder > 0 || currentStock <= 0;

    const note = toOrder > 0
        ? `Нижче мінімуму на ${Math.max(0, minStock - currentStock).toFixed(1)} кг.`
        : 'Запас стабільний, термінового добору не потрібно.';

    return (
        <div className={cn(
            'rounded-2xl border bg-white p-4 shadow-sm',
            isCritical ? 'border-red-200' : 'border-slate-200'
        )}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className={cn(
                        'inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                        isCritical ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                    )}>
                        {isCritical ? 'Критично' : 'Стабільно'}
                    </div>
                    <div className="mt-3 text-sm font-semibold leading-5 text-slate-900">{item.name}</div>
                </div>

                {storeData.isLive === false && (
                    <div className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                        <AlertCircle size={11} />
                        без онлайн-синхронізації
                    </div>
                )}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Фактичний залишок</div>
                    <div className={cn('mt-1 text-xl font-bold tabular-nums', isCritical ? 'text-red-700' : 'text-slate-900')}>
                        {currentStock.toFixed(0)}
                    </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Мінімум</div>
                    <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{minStock.toFixed(0)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">До заявки</div>
                    <div className={cn('mt-1 text-xl font-bold tabular-nums', toOrder > 0 ? 'text-red-700' : 'text-slate-900')}>
                        {toOrder.toFixed(1)}
                    </div>
                </div>
            </div>

            <div className="mt-4 text-sm text-slate-600">{note}</div>
        </div>
    );
}
