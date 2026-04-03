import React, { useState, useEffect } from 'react';
import { RefreshCcw, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OrderTable, OrderItem } from './OrderTable';
import { CriticalTable, CriticalItem } from './CriticalTable';

interface PlanSummary {
    total_kg: number;
    capacity_kg: number;
    utilization_pct: number;
    sku_count: number;
}

export const SadovaProductionPlanner: React.FC = () => {
    const [orderD1, setOrderD1] = useState<OrderItem[]>([]);
    const [summaryD1, setSummaryD1] = useState<PlanSummary | null>(null);

    const [criticalD2, setCriticalD2] = useState<CriticalItem[]>([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [orderD2, setOrderD2] = useState<any[]>([]);
    const [summaryD2, setSummaryD2] = useState<PlanSummary | null>(null);

    const [criticalD3, setCriticalD3] = useState<CriticalItem[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [orderD3, setOrderD3] = useState<any[]>([]);
    const [summaryD3, setSummaryD3] = useState<PlanSummary | null>(null);

    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [activeTab, setActiveTab] = useState<'d1' | 'd2' | 'd3'>('d1');
    const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch D1 Plan
            const resD1 = await fetch('/api/sadova/plan-d1');
            const dataD1 = await resD1.json();
            if (dataD1.success) {
                // Map data to calculate portions if portion_size > 0
                const orderData1 = (dataD1.data || []).map((item: any) => ({
                    ...item,
                    portions: item.portion_size > 0 ? Math.ceil(item.final_qty / item.portion_size) : 0
                }));
                setOrderD1(orderData1);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const total_kg_d1 = orderData1.reduce((sum: number, item: any) => sum + parseFloat(item.final_qty || 0), 0);
                const capacity_kg_d1 = 495;
                const utilization_pct_d1 = capacity_kg_d1 > 0 ? (total_kg_d1 / capacity_kg_d1) * 100 : 0;

                setSummaryD1({
                    total_kg: total_kg_d1,
                    capacity_kg: capacity_kg_d1,
                    utilization_pct: utilization_pct_d1,
                    sku_count: orderData1.length
                });
            }

            // Fetch D2 Critical
            const resCritD2 = await fetch('/api/sadova/critical-d2');
            const dataCritD2 = await resCritD2.json();
            if (dataCritD2.success) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setCriticalD2(dataCritD2.data.map((item: any) => ({
                    product_name: item.product_name,
                    zeros: item.zeros_d2,
                    deficit: item.deficit_d2,
                    total_stock: item.total_stock_d2
                })));
            }

            // Fetch D2 Plan
            const resD2 = await fetch('/api/sadova/plan-d2');
            const dataD2 = await resD2.json();
            if (dataD2.success) {
                const orderData = dataD2.data || [];
                setOrderD2(orderData);

                // Calculate summary D2
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const total_kg_d2 = orderData.reduce((sum: number, item: any) => sum + parseFloat(item.allocated_d2 || 0), 0);
                const capacity_kg_d2 = 495;
                const utilization_pct_d2 = capacity_kg_d2 > 0 ? (total_kg_d2 / capacity_kg_d2) * 100 : 0;

                setSummaryD2({
                    total_kg: total_kg_d2,
                    capacity_kg: capacity_kg_d2,
                    utilization_pct: utilization_pct_d2,
                    sku_count: orderData.length
                });
            }

            // Fetch D3 Critical
            const resCritD3 = await fetch('/api/sadova/critical-d3');
            const dataCritD3 = await resCritD3.json();
            if (dataCritD3.success) {
                // Ensure shape matches CriticalItem interface
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setCriticalD3(dataCritD3.data.map((item: any) => ({
                    product_name: item.product_name,
                    zeros: item.zeros_d3,
                    deficit: item.deficit_d3,
                    total_stock: item.total_stock_d3
                })));
            }

            // Fetch D3 Plan
            const resD3 = await fetch('/api/sadova/plan-d3');
            const dataD3 = await resD3.json();
            if (dataD3.success) {
                const orderData3 = dataD3.data || [];
                setOrderD3(orderData3);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const total_kg_d3 = orderData3.reduce((sum: number, item: any) => sum + parseFloat(item.allocated_d3 || 0), 0);
                const capacity_kg_d3 = 495;
                const utilization_pct_d3 = capacity_kg_d3 > 0 ? (total_kg_d3 / capacity_kg_d3) * 100 : 0;

                setSummaryD3({
                    total_kg: total_kg_d3,
                    capacity_kg: capacity_kg_d3,
                    utilization_pct: utilization_pct_d3,
                    sku_count: orderData3.length
                });
            }

            setLastFetchTime(new Date());

        } catch (error) {
            console.error('Error fetching planner data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSubmitOrder = async () => {
        if (orderD1.length === 0) return;

        setSending(true);
        try {
            const payload = {
                order_type: 'd1',
                order: orderD1,
                summary: summaryD1,
                critical: criticalD2,
                generated_at: new Date().toISOString()
            };

            const response = await fetch('/api/sadova/submit-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                alert('Заявка успішно відправлена в Telegram!');
            } else {
                alert('Помилка при відправці заявки.');
            }
        } catch (error) {
            console.error('Error submitting order to n8n:', error);
            alert('Помилка з\'єднання при відправці заявки.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="flex flex-col h-full w-full font-sans text-text-primary min-h-[500px]">
            {/* Planner Header & Tabs */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex gap-2 bg-panel-bg p-1.5 rounded-xl border border-panel-border backdrop-blur-md shadow-[var(--panel-shadow)]">
                    <button
                        onClick={() => setActiveTab('d1')}
                        className={cn(
                            "px-6 py-2 rounded-lg text-sm font-bold tracking-wide transition-all",
                            activeTab === 'd1'
                                ? "bg-accent-primary text-bg-primary shadow-[0_0_15px_rgba(var(--color-accent-primary),0.4)]"
                                : "text-text-secondary hover:text-text-primary hover:bg-bg-primary/50"
                        )}
                    >
                        ДЕНЬ 1
                    </button>
                    <button
                        onClick={() => setActiveTab('d2')}
                        className={cn(
                            "px-6 py-2 rounded-lg text-sm font-bold tracking-wide transition-all",
                            activeTab === 'd2'
                                ? "bg-accent-primary text-bg-primary shadow-[0_0_15px_rgba(var(--color-accent-primary),0.4)]"
                                : "text-text-secondary hover:text-text-primary hover:bg-bg-primary/50"
                        )}
                    >
                        ДЕНЬ 2
                    </button>
                    <button
                        onClick={() => setActiveTab('d3')}
                        className={cn(
                            "px-6 py-2 rounded-lg text-sm font-bold tracking-wide transition-all",
                            activeTab === 'd3'
                                ? "bg-accent-primary text-bg-primary shadow-[0_0_15px_rgba(var(--color-accent-primary),0.4)]"
                                : "text-text-secondary hover:text-text-primary hover:bg-bg-primary/50"
                        )}
                    >
                        ДЕНЬ 3
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    {lastFetchTime && (
                        <div className="text-[10px] text-text-muted font-medium">
                            Оновлено: {lastFetchTime.toLocaleTimeString('uk-UA')}
                        </div>
                    )}
                    <button
                        onClick={fetchData}
                        disabled={loading || sending}
                        className="p-2.5 rounded-lg bg-panel-bg hover:bg-bg-primary text-text-secondary border border-panel-border shadow-[var(--panel-shadow)] transition-colors disabled:opacity-50"
                        title="Оновити розрахунок"
                    >
                        <RefreshCcw size={16} className={cn(loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-24 space-y-8">
                {activeTab === 'd1' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div>
                            <h2 className="text-xl font-black text-text-primary mb-4 tracking-tight flex items-center gap-2">
                                Завдання на виробництво (Д1)
                            </h2>
                            <OrderTable data={orderD1} summary={summaryD1} />
                        </div>

                        <div>
                            <CriticalTable data={criticalD2} />
                        </div>
                    </div>
                )}

                {activeTab === 'd2' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div>
                            <h2 className="text-xl font-black text-text-primary mb-4 tracking-tight">
                                Попередній план на Д2
                            </h2>
                            {/* Reusing OrderTable but formatting it slightly differently since data shape is different for D2 */}
                            {summaryD2 && (
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="bg-panel-bg p-4 rounded-xl border border-panel-border shadow-[var(--panel-shadow)]">
                                        <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-1">Орієнтовне завантаження Д2</div>
                                        <div className="flex items-baseline gap-2">
                                            <span className={cn(
                                                "text-2xl font-mono font-black",
                                                Number(summaryD2.utilization_pct) > 95 ? "text-status-success" :
                                                    Number(summaryD2.utilization_pct) >= 85 ? "text-status-warning" : "text-status-critical"
                                            )}>
                                                {Number(summaryD2.utilization_pct || 0).toFixed(1)}%
                                            </span>
                                            <span className="text-sm font-medium text-text-muted">з 495 кг</span>
                                        </div>
                                    </div>
                                    <div className="bg-panel-bg p-4 rounded-xl border border-panel-border shadow-[var(--panel-shadow)]">
                                        <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-1">Очікуваний об'єм Д2</div>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-2xl font-mono font-black text-text-primary">{Number(summaryD2.total_kg || 0).toFixed(0)}</span>
                                            <span className="text-sm font-medium text-text-muted">кг</span>
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
                                                <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-text-muted text-right">Потреба (кг)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {orderD2.length === 0 ? (
                                                <tr>
                                                    <td colSpan={3} className="p-8 text-center text-text-muted text-sm border-b border-panel-border">
                                                        Немає даних
                                                    </td>
                                                </tr>
                                                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                            ) : orderD2.map((item, i) => (
                                                <tr key={item.product_name} className="border-b border-panel-border hover:bg-bg-primary/50 transition-colors">
                                                    <td className="p-3 text-sm text-text-muted font-mono">{item.rank}</td>
                                                    <td className="p-3 text-sm font-semibold text-text-primary">{item.product_name}</td>
                                                    <td className="p-3 text-base text-text-primary font-mono font-bold text-right">{item.allocated_d2.toFixed(1)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div>
                            <CriticalTable data={criticalD3} />
                        </div>
                    </div>
                )}

                {activeTab === 'd3' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div>
                            <h2 className="text-xl font-black text-text-primary mb-4 tracking-tight">
                                Попередній план на Д3
                            </h2>
                            {summaryD3 && (
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="bg-panel-bg p-4 rounded-xl border border-panel-border shadow-[var(--panel-shadow)]">
                                        <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-1">Орієнтовне завантаження Д3</div>
                                        <div className="flex items-baseline gap-2">
                                            <span className={cn(
                                                "text-2xl font-mono font-black",
                                                Number(summaryD3.utilization_pct) > 95 ? "text-status-success" :
                                                    Number(summaryD3.utilization_pct) >= 85 ? "text-status-warning" : "text-status-critical"
                                            )}>
                                                {Number(summaryD3.utilization_pct || 0).toFixed(1)}%
                                            </span>
                                            <span className="text-sm font-medium text-text-muted">з 495 кг</span>
                                        </div>
                                    </div>
                                    <div className="bg-panel-bg p-4 rounded-xl border border-panel-border shadow-[var(--panel-shadow)]">
                                        <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-1">Очікуваний об'єм Д3</div>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-2xl font-mono font-black text-text-primary">{Number(summaryD3.total_kg || 0).toFixed(0)}</span>
                                            <span className="text-sm font-medium text-text-muted">кг</span>
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
                                                <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-text-muted text-right">Потреба (кг)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {orderD3.length === 0 ? (
                                                <tr>
                                                    <td colSpan={3} className="p-8 text-center text-text-muted text-sm border-b border-panel-border">
                                                        Немає даних
                                                    </td>
                                                </tr>
                                                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                            ) : orderD3.map((item, i) => (
                                                <tr key={item.product_name} className="border-b border-panel-border hover:bg-bg-primary/50 transition-colors">
                                                    <td className="p-3 text-sm text-text-muted font-mono">{item.rank}</td>
                                                    <td className="p-3 text-sm font-semibold text-text-primary">{item.product_name}</td>
                                                    <td className="p-3 text-base text-text-primary font-mono font-bold text-right">{item.allocated_d3.toFixed(1)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div>
                            <CriticalTable data={criticalD3} />
                        </div>
                    </div>
                )}
            </div>

            {/* Floating Action Bar */}
            <div className="sticky bottom-0 mt-auto p-4 border-t border-panel-border bg-bg-primary/95 backdrop-blur-xl z-20 flex justify-end shrink-0">
                <button
                    onClick={handleSubmitOrder}
                    disabled={loading || sending || orderD1.length === 0}
                    className="flex items-center gap-2 px-8 py-3.5 bg-accent-primary hover:bg-accent-primary/90 text-bg-primary font-black uppercase tracking-widest text-sm rounded-xl transition-all shadow-[0_0_20px_rgba(var(--color-accent-primary),0.3)] disabled:opacity-50 disabled:shadow-none"
                >
                    {sending ? (
                        <RefreshCcw size={18} className="animate-spin" />
                    ) : (
                        <Send size={18} />
                    )}
                    Сформувати заявку (Д1)
                </button>
            </div>
        </div>
    );
};
