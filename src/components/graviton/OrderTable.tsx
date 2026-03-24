import React from 'react';
import { cn } from '@/lib/utils';

export interface OrderItem {
    rank: number;
    product_name: string;
    category_name: string;
    final_qty: number;
    risk_index: number;
    portion_size: number;
    zero_shops: number;
}

interface OrderTableProps {
    data: OrderItem[];
    summary: {
        total_kg: number;
        utilization_pct: number;
        sku_count: number;
    } | null;
}

export const OrderTable: React.FC<OrderTableProps> = ({ data, summary }) => {
    return (
        <div className="flex flex-col gap-4">
            {summary && (
                <div className="grid grid-cols-3 gap-4 mb-2">
                    <div className="bg-panel-bg p-4 rounded-xl border border-panel-border shadow-[var(--panel-shadow)]">
                        <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-1">Завантаження</div>
                        <div className="flex items-baseline gap-2">
                            <span className={cn(
                                "text-2xl font-mono font-black",
                                Number(summary.utilization_pct) > 95 ? "text-status-success" :
                                    Number(summary.utilization_pct) >= 85 ? "text-status-warning" : "text-status-critical"
                            )}>
                                {Number(summary.utilization_pct || 0).toFixed(1)}%
                            </span>
                            <span className="text-sm font-medium text-text-muted">з 495 кг</span>
                        </div>
                    </div>

                    <div className="bg-panel-bg p-4 rounded-xl border border-panel-border shadow-[var(--panel-shadow)]">
                        <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-1">Всього замовлення</div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-mono font-black text-text-primary">{Number(summary.total_kg || 0).toFixed(0)}</span>
                            <span className="text-sm font-medium text-text-muted">кг</span>
                        </div>
                    </div>

                    <div className="bg-panel-bg p-4 rounded-xl border border-panel-border shadow-[var(--panel-shadow)]">
                        <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-1">Кількість SKU</div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-mono font-black text-accent-primary">{summary.sku_count}</span>
                            <span className="text-sm font-medium text-text-muted">продуктів</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-panel-bg shadow-[var(--panel-shadow)] rounded-xl border border-panel-border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-bg-primary border-b border-panel-border">
                                <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-text-muted">#</th>
                                <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-text-muted">Продукт</th>
                                <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-text-muted">Категорія</th>
                                <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-text-muted text-right">Кількість (кг)</th>
                                <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-text-muted text-right">Заміс (кг)</th>
                                <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-text-muted text-right">Risk</th>
                                <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-text-muted text-center">Нулів</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-text-muted text-sm border-b border-panel-border">
                                        Немає даних для відображення
                                    </td>
                                </tr>
                            ) : data.map((item, i) => (
                                <tr key={item.product_name || i} className="border-b border-panel-border hover:bg-bg-primary/50 transition-colors">
                                    <td className="p-3 text-sm text-text-muted font-mono">{item.rank}</td>
                                    <td className="p-3 text-sm font-semibold text-text-primary">{item.product_name}</td>
                                    <td className="p-3 text-xs text-text-secondary">{item.category_name}</td>
                                    <td className="p-3 text-base text-text-primary font-mono font-bold text-right flex flex-col items-end">
                                        <span>{item.final_qty}</span>
                                        {item.portion_size > 0 && item.final_qty > 0 && (
                                            <span className="text-[10px] font-medium text-text-muted mt-0.5 whitespace-nowrap">
                                                {Math.ceil(item.final_qty / item.portion_size)} замісів
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-3 text-sm text-text-secondary font-mono text-right">{item.portion_size}</td>
                                    <td className="p-3 text-sm text-status-warning font-mono text-right">{item.risk_index}</td>
                                    <td className="p-3 text-center">
                                        {item.zero_shops > 0 ? (
                                            <span className="inline-flex items-center justify-center min-w-[24px] h-[24px] rounded bg-status-critical/20 text-status-critical text-xs font-bold ring-1 ring-status-critical/50">
                                                {item.zero_shops}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center justify-center min-w-[24px] h-[24px] rounded bg-panel-border/30 text-text-muted text-xs font-bold">
                                                0
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
