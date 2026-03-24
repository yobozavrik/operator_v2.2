import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, AlertTriangle } from 'lucide-react';

export interface CriticalItem {
    product_name: string;
    zeros: number;
    deficit: number;
    total_stock: number;
}

interface CriticalTableProps {
    data: CriticalItem[];
}

export const CriticalTable: React.FC<CriticalTableProps> = ({ data }) => {
    return (
        <div className="flex flex-col gap-3">
            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <AlertCircle className="text-status-critical" size={20} />
                Критичні позиції
            </h3>

            <div className="bg-panel-bg shadow-[var(--panel-shadow)] rounded-xl border border-status-critical/20 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-status-critical/5 border-b border-status-critical/20">
                                <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-text-muted">Продукт</th>
                                <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-text-muted text-center">Магазинів з нулем</th>
                                <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-text-muted text-right">Дефіцит (кг)</th>
                                <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-text-muted text-right">Залишок (кг)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-text-muted text-sm border-b border-panel-border">
                                        Немає критичних позицій
                                    </td>
                                </tr>
                            ) : data.map((item, i) => (
                                <tr
                                    key={item.product_name || i}
                                    className={cn(
                                        "border-b border-panel-border transition-colors",
                                        item.zeros > 2 ? "bg-status-critical/10 hover:bg-status-critical/20" : "bg-status-warning/5 hover:bg-status-warning/10"
                                    )}
                                >
                                    <td className="p-3 text-sm font-semibold text-text-primary flex items-center gap-2">
                                        {item.zeros > 2 && <AlertTriangle size={14} className="text-status-critical" />}
                                        {item.product_name}
                                    </td>
                                    <td className="p-3 text-center">
                                        <span className={cn(
                                            "inline-flex items-center justify-center min-w-[28px] h-[28px] rounded text-sm font-bold shadow-sm",
                                            item.zeros > 2
                                                ? "bg-status-critical text-bg-primary ring-1 ring-bg-primary/20"
                                                : "bg-status-warning text-bg-primary ring-1 ring-bg-primary/20"
                                        )}>
                                            {item.zeros}
                                        </span>
                                    </td>
                                    <td className="p-3 text-base text-text-primary font-mono font-bold text-right">
                                        {item.deficit > 0 ? (
                                            <span className="text-status-critical">-{item.deficit.toFixed(1)}</span>
                                        ) : (
                                            <span className="text-text-muted">0</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-base text-text-primary font-mono font-bold text-right">{item.total_stock.toFixed(1)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
