import React from 'react';

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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Завантаження</div>
                        <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{Number(summary.utilization_pct || 0).toFixed(1)}%</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Всього замовлення</div>
                        <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{Number(summary.total_kg || 0).toFixed(0)} кг</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Кількість SKU</div>
                        <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{summary.sku_count}</div>
                    </div>
                </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead className="bg-slate-50">
                            <tr className="border-b border-slate-200">
                                <th className="p-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">#</th>
                                <th className="p-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Продукт</th>
                                <th className="p-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Категорія</th>
                                <th className="p-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 text-right">Кількість</th>
                                <th className="p-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 text-right">Заміс</th>
                                <th className="p-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 text-right">Індекс ризику</th>
                                <th className="p-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 text-center">Нулів</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-sm text-slate-500">Немає даних для відображення</td>
                                </tr>
                            ) : data.map((item, index) => (
                                <tr key={`${item.product_name}-${index}`} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="p-3 text-sm tabular-nums text-slate-500">{item.rank}</td>
                                    <td className="p-3 text-sm font-semibold text-slate-900">{item.product_name}</td>
                                    <td className="p-3 text-sm text-slate-600">{item.category_name}</td>
                                    <td className="p-3 text-right text-sm font-semibold tabular-nums text-slate-900">{item.final_qty}</td>
                                    <td className="p-3 text-right text-sm tabular-nums text-slate-600">{item.portion_size}</td>
                                    <td className="p-3 text-right text-sm tabular-nums text-slate-600">{item.risk_index}</td>
                                    <td className="p-3 text-center">
                                        <span
                                            className={item.zero_shops > 0
                                                ? 'inline-flex min-w-[28px] items-center justify-center rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700'
                                                : 'inline-flex min-w-[28px] items-center justify-center rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500'}
                                        >
                                            {item.zero_shops}
                                        </span>
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
