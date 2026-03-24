import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Shop {
    spot_id: number;
    spot_name: string;
}

interface Props {
    shops: Shop[];
    selectedShops: number[];
    setSelectedShops: (ids: number[]) => void;
}

export const ShopSelector = ({ shops, selectedShops, setSelectedShops }: Props) => {
    const toggleShop = (spotId: number) => {
        if (selectedShops.includes(spotId)) {
            setSelectedShops(selectedShops.filter(id => id !== spotId));
        } else {
            setSelectedShops([...selectedShops, spotId]);
        }
    };

    const toggleAll = () => {
        if (selectedShops.length === shops.length) {
            setSelectedShops([]);
        } else {
            setSelectedShops(shops.map(s => s.spot_id));
        }
    };

    return (
        <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Магазини для розподілу</h3>
                    <div className="mt-1 text-sm text-slate-600">Обери точки, які входять у поточний розрахунок.</div>
                </div>
                <button
                    onClick={toggleAll}
                    disabled={shops.length === 0}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                    {selectedShops.length === shops.length && shops.length > 0 ? 'Зняти всі' : 'Обрати всі'}
                </button>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {shops.map(shop => {
                    const isSelected = selectedShops.includes(shop.spot_id);
                    return (
                        <label
                            key={shop.spot_id}
                            className={cn(
                                'flex items-center gap-3 rounded-xl border px-3 py-3 cursor-pointer transition-colors',
                                isSelected
                                    ? 'border-blue-200 bg-blue-50'
                                    : 'border-slate-200 bg-white hover:bg-slate-50'
                            )}
                        >
                            <div className={cn(
                                'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                                isSelected
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-slate-300 bg-white text-transparent'
                            )}>
                                <Check size={13} strokeWidth={3} />
                            </div>

                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleShop(shop.spot_id)}
                                className="hidden"
                            />
                            <span className={cn('truncate text-sm font-medium', isSelected ? 'text-slate-900' : 'text-slate-700')} title={shop.spot_name}>
                                {shop.spot_name}
                            </span>
                        </label>
                    );
                })}
            </div>

            <div className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-600">
                Обрано: <span className="font-semibold text-slate-900">{selectedShops.length}</span> з {shops.length}
            </div>
        </div>
    );
};
