import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ChefHat, Activity, CheckCircle, Percent, RefreshCw, Calculator, Loader2, AlertCircle, Truck, Settings2, ClipboardList } from 'lucide-react';
import { FloridaPowerMatrix } from '../FloridaPowerMatrix';
import { FloridaProductionOpsTable } from './FloridaProductionOrderTable';
import { ProductionTask } from '@/types/bi';
import { BackToHome } from '../BackToHome';
import { FloridaDistributionModal } from '../FloridaDistributionModal';
import { FloridaProductionDetailModal } from '../FloridaProductionDetailModal';
import { FloridaDistributionControlPanel } from './FloridaDistributionControlPanel';
import FloridaProductionSimulator from './FloridaProductionSimulator';
import { FloridaHistoricalProduction } from './FloridaHistoricalProduction';
import { ThemeToggle } from '../theme-toggle';
import { getFloridaUnit } from '@/lib/florida-dictionary';

// --- SUPPORTING COMPONENTS ---
interface ProductionItem {
    product_name: string;
    baked_at_factory: number;
}

const ProductionDetailView = () => {
    const { data, error, isLoading } = useSWR<ProductionItem[]>(
        '/api/florida/production-detail',
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
                        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Статистика Виробництва</h3>
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
                                <th className="p-4">Флорида</th>
                                <th className="p-4 text-right">Виготовлено (од.)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-panel-border">
                            {data.map((item, i) => (
                                <tr key={i} className="group hover:bg-bg-primary transition-colors">
                                    <td className="p-4 text-sm font-medium text-text-primary group-hover:text-accent-primary">
                                        {item.product_name}
                                    </td>
                                    <td className="p-4 text-right">
                                        <span className="inline-flex items-center justify-center px-4 py-1.5 rounded-lg bg-accent-primary/10 text-accent-primary font-mono text-sm font-black min-w-[4rem] border border-accent-primary/20">
                                            {item.baked_at_factory} <span className="text-[10px] ml-1 opacity-70 lowercase">{getFloridaUnit(item.product_name)}</span>
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
}

export const FloridaProductionTabs = ({ data, onRefresh, showTabs = true }: Props) => {
    // UPDATED TABS: 'matrix' replaces old 'distribution', 'logistics' is NEW
    const [activeTab, setActiveTab] = useState<'orders' | 'matrix' | 'production' | 'history' | 'logistics' | 'simulator'>('matrix');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isUpdatingStock, setIsUpdatingStock] = useState(false);
    const [showDistModal, setShowDistModal] = useState(false);
    const [showProductionModal, setShowProductionModal] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [isStale, setIsStale] = useState(false);
    const [stockData, setStockData] = useState<any>(null);
    const [manufacturedData, setManufacturedData] = useState<any[]>([]);
    const hasAutoSyncedRef = React.useRef(false);

    React.useEffect(() => {
        const checkStaleness = () => {
            const now = new Date();
            const diff = now.getTime() - lastUpdated.getTime();
            setIsStale(diff > 30 * 60 * 1000); // 30 minutes in milliseconds
        };
        checkStaleness(); // Initial check
        const interval = setInterval(checkStaleness, 60000); // Re-check every minute
        return () => clearInterval(interval);
    }, [lastUpdated]);

    // 🏭 PRODUCTION SUMMARY
    const { data: productionSummary } = useSWR('/api/florida/summary', (url) => fetch(url, { credentials: 'include' }).then(r => r.json()), { refreshInterval: 30000 });

    // 🔥 WEBHOOK: Update stock direct from Poster
    const handleUpdateStock = async () => {
        setIsUpdatingStock(true);
        try {
            const response = await fetch('/api/florida/update-stock', {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                // ПОКАЗАТЬ данные из result.data в UI
                // (здесь нужно setState с данными из Poster)
                setStockData(result.data);
                if (result.manufactures) {
                    setManufacturedData(result.manufactures);
                }
                setLastUpdated(new Date());
            } else {
                console.warn(`[Stock Update] Backend reported an issue:`, result);
            }
        } catch (error) {
            console.error('[Stock Update] Network/Fetch error:', error);
        } finally {
            setIsUpdatingStock(false);
        }
    };

    React.useEffect(() => {
        if (hasAutoSyncedRef.current) return;
        hasAutoSyncedRef.current = true;
        void handleUpdateStock();
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        await onRefresh();
        setLastUpdated(new Date());
        setTimeout(() => setIsRefreshing(false), 500);
    };

    const displayData = useMemo(() => {
        if (!stockData || !Array.isArray(stockData)) return data;

        const cleanStr = (s: string) => s.toLowerCase().replace(/[^а-яіїєґa-z0-9]/g, '');

        return data.map(product => {
            let totalNetworkStock = 0;
            const targetNameMap = cleanStr(product.name);

            const enrichedStores = (product.stores || []).map(store => {
                const cleanStoreName = cleanStr(store.storeName);

                // Poster storage_name e.g. "Магазин "Гравітон""
                const matchingStorage = stockData.find((s: any) => {
                    const sName = cleanStr(s.storage_name);
                    const coreName = sName.replace('магазин', '');
                    return (coreName.length > 2 && cleanStoreName.includes(coreName)) || sName.includes(cleanStoreName);
                });

                let newStock = Number(store.currentStock) || 0;

                if (cleanStoreName.includes('кондитерка') || cleanStoreName.includes('цех')) {
                    newStock = 0; // Exclude factories and tseks completely from adding to retail stock array
                } else if (matchingStorage && matchingStorage.leftovers) {
                    const leftover = matchingStorage.leftovers.find((l: any) => cleanStr(l.ingredient_name || '') === targetNameMap);
                    if (leftover) {
                        const rawValue = parseFloat(leftover.storage_ingredient_left || '0');
                        // Poster API natively returns weights in Kg ("kg") and pieces in Pieces ("p").
                        // According to business logic, negative stocks should be considered 0.
                        newStock = Math.max(0, rawValue);
                    }
                }

                totalNetworkStock += newStock;

                return {
                    ...store,
                    currentStock: newStock
                };
            });

            const needNet = Math.max(0, product.minStockThresholdKg - totalNetworkStock);
            const activeStores = enrichedStores.filter(s => s.currentStock <= 0);

            return {
                ...product,
                totalStockKg: totalNetworkStock,
                stores: enrichedStores,
                totalDeficitKg: needNet,
                recommendedQtyKg: needNet <= 0 ? 0 : Math.ceil(needNet / 10) * 10,
                deficitPercent: product.minStockThresholdKg > 0 ? Number(((needNet / product.minStockThresholdKg) * 100).toFixed(1)) : 0,
                outOfStockStores: activeStores.length,
            } as ProductionTask;
        });
    }, [data, stockData]);

    const globalMetrics = useMemo(() => {
        let totalStock = 0, totalMin = 0;
        let totalProduced = 0;

        // 1. Calculate stock and min from displayData
        displayData.forEach(p => {
            totalStock += (p.totalStockKg || 0);
            totalMin += (Number(p.minStockThresholdKg) || 0);
        });

        // 2. Calculate produced from manufacturedData (priority source)
        const cleanStr = (s: string) => s.toLowerCase().replace(/[^а-яіїєґa-z0-9]/g, '');
        // First, check if we have data from posterAPI. If so, use it.
        if (manufacturedData && manufacturedData.length > 0) {
            manufacturedData.forEach((mItem: any) => {
                const qty = parseFloat(mItem.product_num || '0');
                totalProduced += qty;
            });
        } else {
            const summaryProduced = Number((productionSummary as any)?.total_baked || 0);
            if (Number.isFinite(summaryProduced) && summaryProduced > 0) {
                totalProduced = summaryProduced;
            }
        }

        return {
            total: {
                stock: totalStock,
                min: totalMin,
                index: totalMin > 0 ? (totalStock / totalMin) * 100 : 0,
                produced: totalProduced
            }
        };
    }, [displayData, manufacturedData, productionSummary]);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const getIndexColor = (val: number) => {
        if (val >= 96) return "text-emerald-400";
        if (val >= 80) return "text-[#FFB800]";
        return "text-[#E74856]";
    };

    return (
        <div className="flex flex-col h-full w-full font-sans">
            {/* 1. HEADER & MONITORING BLOCK */}
            <header className="flex-shrink-0 p-3 lg:p-4 pb-1 lg:pb-2 z-20">
                <div className="bg-panel-bg rounded-xl border border-panel-border shadow-[var(--panel-shadow)] p-3 flex flex-col gap-3">

                    {/* Top Row: Navigation & Title */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <BackToHome />

                            <div className="flex items-center gap-2">
                                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                                    <ChefHat size={22} className="text-orange-500" />
                                </div>
                                <div className="flex flex-col justify-center">
                                    <h1 className="text-2xl font-bold uppercase tracking-wide leading-none text-text-primary font-[family-name:var(--font-chakra)]">ЦЕХ ФЛОРИДА</h1>
                                    <div className="text-[10px] text-text-secondary uppercase tracking-[0.2em] mt-1 font-[family-name:var(--font-jetbrains)] leading-none">
                                        Менеджер розподілу
                                    </div>
                                </div>
                            </div>

                            <div className="w-px h-8 bg-panel-border mx-2 hidden sm:block"></div>

                            <button
                                onClick={handleUpdateStock}
                                disabled={isUpdatingStock}
                                className={cn(
                                    "h-12 px-6 flex items-center justify-center gap-3 border rounded-xl transition-all shadow-md group",
                                    isUpdatingStock
                                        ? "bg-bg-primary border-panel-border text-text-muted cursor-not-allowed"
                                        : isStale
                                            ? "bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20 hover:border-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                                            : "bg-emerald-500/10 border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/20 hover:border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:-rotate-1"
                                )}
                            >
                                <RefreshCw size={24} className={cn(
                                    isUpdatingStock ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500",
                                    !isUpdatingStock && (isStale ? "drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]" : "drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]")
                                )} />
                                <span className={cn(
                                    "hidden sm:inline text-2xl font-bold uppercase tracking-wide leading-none font-[family-name:var(--font-chakra)] pt-[3px]",
                                    isStale ? "drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]" : "drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                                )}>
                                    Оновити залишки
                                </span>
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <ThemeToggle />
                        </div>
                    </div>

                    {/* Second Row: Monitoring Cards */}
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
                                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-blue-500">Сьогодні Вироблено</span>
                            </div>
                            <div className="mt-1 relative z-10 flex w-full h-full items-center justify-center">
                                <div className="text-center">
                                    <div className="text-[9px] text-[#A855F7] font-bold mb-0.5 uppercase tracking-wider">🥟 Всього</div>
                                    <div className="flex items-baseline justify-center gap-1">
                                        <span className="text-3xl font-bold tracking-tight text-slate-900">
                                            {globalMetrics.total.produced.toLocaleString()}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-medium font-mono">од.</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 relative overflow-hidden group hover:border-blue-200 hover:shadow-sm transition-all duration-200">
                            <div className="flex items-center gap-2 mb-1.5 text-slate-400">
                                <Activity size={14} className="text-slate-400" />
                                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500">Факт залишок</span>
                            </div>
                            <div className="mt-1 flex w-full h-full items-center justify-center">
                                <div className="text-center">
                                    <div className="text-[9px] text-[#A855F7] font-bold mb-0.5 uppercase tracking-wider">🥟 Всього</div>
                                    <div className="flex items-baseline justify-center gap-1">
                                        <span className="text-3xl font-bold tracking-tight text-slate-900">
                                            {globalMetrics.total.stock.toLocaleString()}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-medium font-mono">од.</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 relative overflow-hidden group hover:border-blue-200 hover:shadow-sm transition-all duration-200">
                            <div className="flex items-center gap-2 mb-1.5 text-slate-400">
                                <CheckCircle size={14} className="text-slate-400" />
                                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500">Норма</span>
                            </div>
                            <div className="mt-1 flex w-full h-full items-center justify-center">
                                <div className="text-center">
                                    <div className="text-[9px] text-[#A855F7] font-bold mb-0.5 uppercase tracking-wider">🥟 Всього</div>
                                    <div className="flex items-baseline justify-center gap-1">
                                        <span className="text-3xl font-bold tracking-tight text-slate-900">
                                            {globalMetrics.total.min.toLocaleString()}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-medium font-mono">од.</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 relative overflow-hidden group hover:border-blue-200 hover:shadow-sm transition-all duration-200">
                            <div className="flex items-center gap-2 mb-1.5 text-slate-400">
                                <Percent size={14} className="text-slate-400" />
                                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500">Індекс заповненостей</span>
                            </div>
                            <div className="mt-1 flex w-full h-full items-center justify-center">
                                <div className="text-center">
                                    <div className="text-[9px] text-[#A855F7] font-bold mb-0.5 uppercase tracking-wider">🥟 Всього</div>
                                    <div className="flex items-baseline justify-center gap-1">
                                        <span className={cn("text-3xl font-bold tracking-tight", globalMetrics.total.index >= 96 ? "text-emerald-500" : globalMetrics.total.index >= 80 ? "text-amber-500" : "text-red-500")}>
                                            {globalMetrics.total.index.toFixed(0)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Third Row: Tabs Container (CONDITIONAL) */}
                    {showTabs && (
                        <div className="flex items-center gap-1 p-1 bg-bg-primary rounded-xl border border-panel-border">
                            <button
                                onClick={() => setActiveTab('matrix')}
                                className={cn(
                                    "flex-1 h-11 px-4 text-[13px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 flex items-center justify-center gap-2 relative overflow-hidden group/tab",
                                    activeTab === 'matrix'
                                        ? "bg-panel-bg text-orange-500 shadow-sm border border-panel-border"
                                        : "text-text-secondary hover:text-text-primary hover:bg-panel-bg/50"
                                )}
                            >
                                <div className={cn(
                                    "p-1.5 rounded-md transition-colors",
                                    activeTab === 'matrix' ? "bg-orange-500/10" : "bg-transparent"
                                )}>
                                    <Activity size={16} strokeWidth={2.5} />
                                </div>
                                <span className="hidden xl:inline">ПОТОЧНИЙ СТАН</span>
                                <span className="xl:hidden">СТАН</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('production')}
                                className={cn(
                                    "flex-1 h-11 px-4 text-[13px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 flex items-center justify-center gap-2 relative overflow-hidden group/tab",
                                    activeTab === 'production'
                                        ? "bg-panel-bg text-accent-primary shadow-sm border border-panel-border"
                                        : "text-text-secondary hover:text-text-primary hover:bg-panel-bg/50"
                                )}
                            >
                                <div className={cn(
                                    "p-1.5 rounded-md transition-colors",
                                    activeTab === 'production' ? "bg-accent-primary/10" : "bg-transparent"
                                )}>
                                    <ChefHat size={16} strokeWidth={2.5} />
                                </div>
                                <span className="hidden xl:inline">ВИРОБНИЦТВО</span>
                                <span className="xl:hidden">PROD</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('logistics')}
                                className={cn(
                                    "flex-1 h-11 px-4 text-[13px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 flex items-center justify-center gap-2 relative overflow-hidden group/tab",
                                    activeTab === 'logistics'
                                        ? "bg-panel-bg text-status-success shadow-sm border border-panel-border"
                                        : "text-text-secondary hover:text-text-primary hover:bg-panel-bg/50"
                                )}
                            >
                                <div className={cn(
                                    "p-1.5 rounded-md transition-colors",
                                    activeTab === 'logistics' ? "bg-status-success/10 text-status-success" : "bg-transparent"
                                )}>
                                    <Truck size={16} strokeWidth={2.5} />
                                </div>
                                <span className="hidden xl:inline">ЛОГІСТИКА (NEW)</span>
                                <span className="xl:hidden">LOG</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('history')}
                                className={cn(
                                    "flex-1 h-11 px-4 text-[13px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 flex items-center justify-center gap-2 relative overflow-hidden group/tab",
                                    activeTab === 'history'
                                        ? "bg-panel-bg text-blue-500 shadow-sm border border-panel-border"
                                        : "text-text-secondary hover:text-text-primary hover:bg-panel-bg/50"
                                )}
                            >
                                <div className={cn(
                                    "p-1.5 rounded-md transition-colors",
                                    activeTab === 'history' ? "bg-blue-500/10 text-blue-500" : "bg-transparent"
                                )}>
                                    <ClipboardList size={16} strokeWidth={2.5} />
                                </div>
                                <span className="hidden xl:inline">180 ДНІВ</span>
                                <span className="xl:hidden">180D</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('simulator')}
                                className={cn(
                                    "flex-1 h-11 px-4 text-[13px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 flex items-center justify-center gap-2 relative overflow-hidden group/tab",
                                    activeTab === 'simulator'
                                        ? "bg-panel-bg text-rose-500 shadow-sm border border-panel-border"
                                        : "text-text-secondary hover:text-text-primary hover:bg-panel-bg/50"
                                )}
                            >
                                <div className={cn(
                                    "p-1.5 rounded-md transition-colors",
                                    activeTab === 'simulator' ? "bg-rose-500/10 text-rose-500" : "bg-transparent"
                                )}>
                                    <Settings2 size={16} strokeWidth={2.5} />
                                </div>
                                <span className="hidden xl:inline">СИМУЛЯТОР</span>
                                <span className="xl:hidden">SIM</span>
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {/* 2. CONTENT BLOCK */}
            <div className="flex-1 overflow-hidden relative">
                {(!showTabs || activeTab === 'orders') && (
                    <FloridaProductionOpsTable data={displayData} onRefresh={onRefresh} />
                )}
                {(showTabs && activeTab === 'matrix') && (
                    <FloridaPowerMatrix data={displayData} onRefresh={onRefresh} />
                )}
                {(showTabs && activeTab === 'production') && (
                    <ProductionDetailView />
                )}
                {(showTabs && activeTab === 'logistics') && (
                    <FloridaDistributionControlPanel />
                )}
                {(showTabs && activeTab === 'history') && (
                    <FloridaHistoricalProduction />
                )}
                {(showTabs && activeTab === 'simulator') && (
                    <FloridaProductionSimulator />
                )}
            </div>

            {/* MODALS */}
            <FloridaDistributionModal
                isOpen={showDistModal}
                onClose={() => setShowDistModal(false)}
                products={displayData}
            />
            <FloridaProductionDetailModal
                isOpen={showProductionModal}
                onClose={() => setShowProductionModal(false)}
            />
        </div>
    );
};
