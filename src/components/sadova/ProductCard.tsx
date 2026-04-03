
import React from 'react';
import { cn } from '@/lib/utils';
import { ProductionTask } from '@/types/bi';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AlertCircle, ChevronDown, CheckCircle2 } from 'lucide-react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { UI_TOKENS } from '@/lib/design-tokens';

interface ProductCardProps {
    item: ProductionTask;
    planningDays: number;
    isSelected: boolean;
    onToggleExpand: () => void;
    onToggleSelect: () => void;
    isExpanded: boolean;
    // Dynamic props calculated in parent
    totalDynamic: number;
    criticalStoreCount: number;
}

export const ProductCard = ({
    item,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    planningDays,
    isSelected,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onToggleExpand,
    onToggleSelect,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isExpanded,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    totalDynamic,
    criticalStoreCount
}: ProductCardProps) => {

    // Deficit percentage for progress bar (heuristic)
    // Let's assume max needed is around 20 for scaling or use a relative metric
    // If totalDynamic > 0, we show it.
    // Percentage = (Stock / (Stock + Needed)) * 100 roughly? 
    // Or just a visual indicator of "How critical it is".
    // The screenshot shows a red progress bar.

    // Let's calculate total stock across all stores for this product
    const totalStock = item.stores.reduce((sum, s) => sum + s.currentStock, 0);
    const totalMin = item.stores.reduce((sum, s) => sum + s.minStock, 0);

    // Progress bar logic:
    // If stock < min, it's critical (red).
    // Bar width could be stock / min * 100 capped at 100.
    const progressPercent = totalMin > 0 ? Math.min(100, (totalStock / totalMin) * 100) : 100;

    // Color classification
    const isCritical = totalStock < totalMin;
    const cardColorClass = isCritical ? "border-red-500/20 bg-red-500/5 hover:border-red-500/40" : "border-white/10 bg-[#141829] hover:border-white/20";
    const textColorClass = isCritical ? "text-red-500" : "text-white";
    const progressBarColor = isCritical ? "bg-red-500" : "bg-emerald-500";


    return (
        <div
            className={cn(
                "relative flex flex-col justify-between rounded-xl border transition-all duration-300 overflow-hidden group select-none min-h-[140px]",
                cardColorClass,
                isSelected && "ring-2 ring-[#00D4FF] border-[#00D4FF]/50 bg-[#00D4FF]/5"
            )}
            onClick={onToggleSelect}
        >
            {/* Selection Checkbox (Absolute Top Right) */}
            <div className="absolute top-3 right-3 z-10">
                <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                    isSelected
                        ? "border-[#00D4FF] bg-[#00D4FF] text-[#0B0E14]"
                        : "border-white/10 group-hover:border-white/30 bg-black/20"
                )}>
                    {isSelected && <CheckCircle2 size={12} strokeWidth={4} />}
                </div>
            </div>

            <div className="p-4 flex flex-col h-full">
                {/* Header: Icon + Name */}
                <div className="flex items-start gap-3 mb-4 pr-6">
                    <div className="text-xl">🍕</div> {/* Placeholder icon, maybe dynamic based on category */}
                    <div className="flex flex-col">
                        <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest leading-none mb-1">Піца</span>
                        <h3 className={cn("text-xs font-black uppercase tracking-wider leading-tight line-clamp-2", isSelected ? "text-[#00D4FF]" : "text-white/90")}>
                            {item.name}
                        </h3>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-4 mt-auto">
                    {/* Left: Stock */}
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 mb-0.5">Залишок</span>
                        <div className="flex items-baseline gap-1">
                            <span className={cn("text-2xl font-black font-mono leading-none", textColorClass)}>
                                {Math.round(totalStock)}
                            </span>
                            <span className="text-[9px] font-bold text-white/20 uppercase">шт</span>
                        </div>
                    </div>

                    {/* Right: Critical Stores */}
                    <div className="flex flex-col items-end">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 mb-0.5 text-right w-full">Критичні</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black font-mono leading-none text-[#FF6B6B]">
                                {criticalStoreCount}
                            </span>
                            <span className="text-[9px] font-bold text-white/20 uppercase">маг</span>
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-4 h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                    <div
                        className={cn("h-full rounded-full transition-all duration-500", progressBarColor)}
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>

            </div>

            {/* Expand Button (Optional, if we want to show stores inside) */}
            {/* 
      <div 
        className="absolute bottom-2 right-2 p-1.5 rounded-lg hover:bg-white/10 text-white/20 hover:text-white transition-colors cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
      >
        <ChevronDown size={14} className={cn("transition-transform", isExpanded && "rotate-180")} />
      </div>
      */}

        </div>
    );
};
