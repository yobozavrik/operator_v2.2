import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ChefHat, Activity, CheckCircle, Percent, RefreshCw, Calculator, Loader2, AlertCircle, Truck, Settings2, ClipboardList } from 'lucide-react';
import { PizzaPowerMatrix } from '../PizzaPowerMatrix';
import { ProductionOpsTable } from './ProductionOrderTable';
import { ProductionTask } from '@/types/bi';
import { BackToHome } from '../BackToHome';
import { DistributionModal } from '../DistributionModal';
import { ProductionDetailModal } from '../ProductionDetailModal';
import { DistributionControlPanel } from './DistributionControlPanel';
import ProductionSimulator from './ProductionSimulator';
import { ThemeToggle } from '../theme-toggle';

interface ProductionItem {
    product_name: string;
    baked_at_factory: number;
}

const ProductionDetailView = () => {
    const { data, error, isLoading } = useSWR<ProductionItem[]>(
        '/api/pizza/production-detail',
        (url) => fetch(url, { credentials: 'include' }).then(r => r.json()),
        { refreshInterval: 10000 }
    );

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-6 bg-bg-primary">
            <div className="bg-panel-bg rounded-xl border border-panel-border shadow-[var(--panel-shadow)] overflow-hidden">
                <div className="p-4 border-b border-panel-border bg-panel-bg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center">
                            <ChefHat size={16} className="text-accent-primary" />
                        </div>
                        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Статистика виробництва</h3>
                    </div>
                    <div className="text-[10px] text-text-secondary uppercase font-black tracking-widest">Останні 24 год</div>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-text-secondary gap-3">
                        <Loader2 size={32} className="animate-spin text-accent-primary" />
                        <span className="text-xs font-mono uppercase tracking-widest">Завантаження...</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center py-20 text-red-500 gap-3">
                        <AlertCircle size={32} />
                        <span className="text-sm font-bold">Помилка завантаження</span>
                    </div>
                ) : data && data.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-bg-primary text-[10px] uppercase font-bold tracking-widest text-text-secondary border-b border-panel-border">
                            <tr>
                                <th className="p-4">Піца</th>
                                <th className="p-4 text-right">Виготовлено (шт)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-panel-border">
                            {data.map((item, index) => (
                                <tr key={`${item.product_name}-${index}`} className="group hover:bg-bg-primary transition-colors">
                                    <td className="p-4 text-sm font-medium text-text-primary group-hover:text-accent-primary">
                                        {item.product_name}
                                    </td>
                                    <td className="p-4 text-right">
                                        <span className="inline-flex items-center justify-center px-4 py-1.5 rounded-lg bg-accent-primary/10 text-accent-primary font-mono text-sm font-black min-w-[4rem] border border-accent-primary/20">
                                            {item.baked_at_factory}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                        <ChefHat size={32} className="mb-3 opacity-20" />
                        <span className="text-sm font-medium">Дані відсутні</span>
                    </div>
                )}
            </div>
        </div>
    );
};

interface Props {
    data: ProductionTask[];
    onRefresh: () => void;
    showTabs?: boolean;
    isLoading?: boolean;
}

const MetricSkeleton = ({ width = 'w-24' }: { width?: string }) => (
    <div className={cn('h-9 rounded-lg bg-slate-100 animate-pulse', width)} />
);

export const ProductionTabs = ({ data, onRefresh, showTabs = true, isLoading = false }: Props) => {
    const [activeTab, setActiveTab] = useState<'orders' | 'matrix' | 'production' | 'logistics' | 'simulator'>('matrix');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isUpdatingStock, setIsUpdatingStock] = useState(false);
    const [showDistModal, setShowDistModal] = useState(false);
    const [showProductionModal, setShowProductionModal] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [isStale, setIsStale] = useState(false);

    React.useEffect(() => {
        const checkStaleness = () => {
            const now = new Date();
            const diff = now.getTime() - lastUpdated.getTime();
            setIsStale(diff > 30 * 60 * 1000);
        };

        checkStaleness();
        const interval = setInterval(checkStaleness, 60000);
        return () => clearInterval(interval);
    }, [lastUpdated]);

    const handleUpdateStock = async () => {
        setIsUpdatingStock(true);
        try {
            const response = await fetch('/api/pizza/sync-stocks', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
            });

            setLastUpdated(new Date());

            if (response.ok) {
                await onRefresh();
            } else {
                console.warn(`[Stock Update] Backend reported an issue (Status: ${response.status}), but UI timer was reset.`);
                alert('Помилка синхронізації з Poster: ' + response.status);
            }
        } catch (error) {
            console.warn('[Stock Update] Network/Fetch error:', error);
            alert('Помилка мережі при синхронізації');
        } finally {
            setIsUpdatingStock(false);
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        await onRefresh();
        setLastUpdated(new Date());
        setTimeout(() => setIsRefreshing(false), 500);
    };

    const globalMetrics = useMemo(() => {
        const rawNetworkMinStock = data.reduce((sum, product) => sum + (Number(product.minStockThresholdKg) || 0), 0);
        const totalNetworkStock = data.reduce((sum, product) => sum + (Number(product.totalStockKg) || 0), 0);
        const totalNetworkMinStock = rawNetworkMinStock * 2;
        const totalBaked = data.reduce((sum, product) => sum + (Number(product.todayProduction) || 0), 0);
        const fillIndex = totalNetworkMinStock > 0
            ? (totalNetworkStock / totalNetworkMinStock) * 100
            : 0;

        return {
            totalBaked,
            totalNetworkStock,
            totalNetworkMinStock,
            fillIndex,
        };
    }, [data]);

    const renderContent = () => {
        if (isLoading && data.length === 0) {
            return (
                <div className="h-full p-6 bg-bg-primary">
                    <div className="h-full rounded-2xl border border-panel-border bg-panel-bg p-6">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                            {Array.from({ length: 12 }).map((_, index) => (
                                <div key={index} className="h-36 rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="h-1 w-full rounded-full bg-slate-100 mb-3" />
                                    <div className="h-4 w-3/4 rounded bg-slate-100 animate-pulse mb-6 mx-auto" />
                                    <div className="h-10 w-20 rounded bg-slate-100 animate-pulse mx-auto mb-3" />
                                    <div className="h-2 w-full rounded bg-slate-100 animate-pulse" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        if (activeTab === 'matrix') return <PizzaPowerMatrix data={data} onRefresh={onRefresh} />;
        if (activeTab === 'orders') return <ProductionOpsTable data={data} onRefresh={onRefresh} />;
        if (activeTab === 'production') return <ProductionDetailView />;
        if (activeTab === 'logistics') return <DistributionControlPanel />;
        return <ProductionSimulator />;
    };

    return (
        <div className="flex flex-col h-full w-full font-sans">
            <header className="flex-shrink-0 p-3 lg:p-4 pb-1 lg:pb-2 z-20">
                <div className="bg-panel-bg rounded-xl border border-panel-border shadow-[var(--panel-shadow)] p-3 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <BackToHome />

                            <div className="flex items-center gap-2">
                                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                                    <ChefHat size={22} className="text-orange-500" />
                                </div>
                                <div className="flex flex-col justify-center">
                                    <h1 className="text-2xl font-bold uppercase tracking-wide leading-none text-text-primary font-[family-name:var(--font-chakra)]">ЦЕХ ПІЦА</h1>
                                    <div className="text-[10px] text-text-secondary uppercase tracking-[0.2em] mt-1 font-[family-name:var(--font-jetbrains)] leading-none">
                                        Менеджер розподілу
                                    </div>
                                </div>
                            </div>

                            <div className="w-px h-8 bg-panel-border mx-2 hidden sm:block" />

                            <button
                                onClick={handleUpdateStock}
                                disabled={isUpdatingStock}
                                className={cn(
                                    'h-10 px-4 flex items-center justify-center gap-2 border rounded-lg transition-all group',
                                    isUpdatingStock
                                        ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                                        : isStale
                                            ? 'bg-red-50 border-red-300 text-red-500 hover:bg-red-100 animate-pulse'
                                            : 'bg-emerald-50 border-emerald-300 text-emerald-600 hover:bg-emerald-100'
                                )}
                            >
                                <RefreshCw
                                    size={16}
                                    className={cn(
                                        isUpdatingStock ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'
                                    )}
                                />
                                <span className="hidden sm:inline text-sm font-semibold uppercase tracking-wide">
                                    Оновити залишки
                                </span>
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <ThemeToggle />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 my-1">
                        <div
                            onClick={() => setActiveTab('production')}
                            className="rounded-2xl border border-slate-200 bg-white p-4 relative overflow-hidden cursor-pointer group hover:border-blue-200 hover:shadow-sm transition-all duration-200"
                        >
                            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                                <ChefHat size={48} className="text-slate-400" />
                            </div>
                            <div className="flex items-center gap-2 mb-1.5 relative z-10">
                                <ChefHat size={14} className="text-blue-500" />
                                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-blue-500">Виробництво (піца)</span>
                            </div>
                            <div className="flex items-baseline gap-2 relative z-10">
                                {isLoading ? (
                                    <MetricSkeleton />
                                ) : (
                                    <>
                                        <span className="text-3xl font-bold text-slate-900 tracking-tight">
                                            {globalMetrics.totalBaked.toLocaleString()}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-medium">шт.</span>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 relative overflow-hidden group hover:border-blue-200 hover:shadow-sm transition-all duration-200">
                            <div className="flex items-center gap-2 mb-1.5">
                                <Activity size={14} className="text-slate-400" />
                                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500">Факт залишок</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                                {isLoading ? (
                                    <MetricSkeleton />
                                ) : (
                                    <>
                                        <span className={cn(
                                            'text-3xl font-bold tracking-tight',
                                            globalMetrics.fillIndex >= 96 ? 'text-emerald-500' :
                                                globalMetrics.fillIndex >= 80 ? 'text-amber-500' : 'text-red-500'
                                        )}>
                                            {globalMetrics.totalNetworkStock.toLocaleString()}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-medium">шт.</span>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 relative overflow-hidden group hover:border-blue-200 hover:shadow-sm transition-all duration-200">
                            <div className="flex items-center gap-2 mb-1.5">
                                <CheckCircle size={14} className="text-slate-400" />
                                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500">Норма</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                                {isLoading ? (
                                    <MetricSkeleton />
                                ) : (
                                    <>
                                        <span className="text-3xl font-bold text-slate-900 tracking-tight">
                                            {globalMetrics.totalNetworkMinStock.toLocaleString()}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-medium">шт.</span>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 relative overflow-hidden group hover:border-blue-200 hover:shadow-sm transition-all duration-200">
                            <div className="flex items-center gap-2 mb-1.5">
                                <Percent size={14} className="text-slate-400" />
                                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500">Індекс заповненостей</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                                {isLoading ? (
                                    <MetricSkeleton width="w-20" />
                                ) : (
                                    <span className="text-3xl font-bold tracking-tight text-blue-500">
                                        {globalMetrics.fillIndex.toFixed(0)}%
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {showTabs && (
                        <div className="flex items-center gap-1 p-1 bg-bg-primary rounded-xl border border-panel-border">
                            <button
                                onClick={() => setActiveTab('matrix')}
                                className={cn(
                                    'flex-1 h-11 px-4 text-[13px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 flex items-center justify-center gap-2 relative overflow-hidden group/tab',
                                    activeTab === 'matrix'
                                        ? 'bg-panel-bg text-orange-500 shadow-sm border border-panel-border'
                                        : 'text-text-secondary hover:text-text-primary hover:bg-panel-bg/50'
                                )}
                            >
                                <div className={cn(
                                    'p-1.5 rounded-md transition-colors',
                                    activeTab === 'matrix' ? 'bg-orange-500/10' : 'bg-transparent'
                                )}>
                                    <Activity size={16} strokeWidth={2.5} />
                                </div>
                                <span className="hidden xl:inline">ПОТОЧНИЙ СТАН</span>
                                <span className="xl:hidden">СТАН</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('production')}
                                className={cn(
                                    'flex-1 h-11 px-4 text-[13px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 flex items-center justify-center gap-2 relative overflow-hidden group/tab',
                                    activeTab === 'production'
                                        ? 'bg-panel-bg text-accent-primary shadow-sm border border-panel-border'
                                        : 'text-text-secondary hover:text-text-primary hover:bg-panel-bg/50'
                                )}
                            >
                                <div className={cn(
                                    'p-1.5 rounded-md transition-colors',
                                    activeTab === 'production' ? 'bg-accent-primary/10' : 'bg-transparent'
                                )}>
                                    <ChefHat size={16} strokeWidth={2.5} />
                                </div>
                                <span className="hidden xl:inline">ВИРОБНИЦТВО</span>
                                <span className="xl:hidden">ВИР</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('logistics')}
                                className={cn(
                                    'flex-1 h-11 px-4 text-[13px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 flex items-center justify-center gap-2 relative overflow-hidden group/tab',
                                    activeTab === 'logistics'
                                        ? 'bg-panel-bg text-status-success shadow-sm border border-panel-border'
                                        : 'text-text-secondary hover:text-text-primary hover:bg-panel-bg/50'
                                )}
                            >
                                <div className={cn(
                                    'p-1.5 rounded-md transition-colors',
                                    activeTab === 'logistics' ? 'bg-status-success/10 text-status-success' : 'bg-transparent'
                                )}>
                                    <Truck size={16} strokeWidth={2.5} />
                                </div>
                                <span className="hidden xl:inline">ЛОГІСТИКА</span>
                                <span className="xl:hidden">ЛОГ</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('simulator')}
                                className={cn(
                                    'flex-1 h-11 px-4 text-[13px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 flex items-center justify-center gap-2 relative overflow-hidden group/tab',
                                    activeTab === 'simulator'
                                        ? 'bg-panel-bg text-rose-500 shadow-sm border border-panel-border'
                                        : 'text-text-secondary hover:text-text-primary hover:bg-panel-bg/50'
                                )}
                            >
                                <div className={cn(
                                    'p-1.5 rounded-md transition-colors',
                                    activeTab === 'simulator' ? 'bg-rose-500/10' : 'bg-transparent'
                                )}>
                                    <Settings2 size={16} strokeWidth={2.5} />
                                </div>
                                <span className="hidden xl:inline">ПЛАН ВИРОБНИЦТВА</span>
                                <span className="xl:hidden">ПЛАН</span>
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <div className="flex-1 min-h-0 overflow-hidden">
                {renderContent()}
            </div>

            <DistributionModal
                isOpen={showDistModal}
                onClose={() => setShowDistModal(false)}
                products={data}
            />
            <ProductionDetailModal
                isOpen={showProductionModal}
                onClose={() => setShowProductionModal(false)}
            />
        </div>
    );
};
