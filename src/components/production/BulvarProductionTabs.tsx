import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ChefHat, Activity, CheckCircle, Percent, RefreshCw, Calculator, Loader2, AlertCircle, Truck, Settings2, ClipboardList, TrendingUp } from 'lucide-react';
import { BulvarPowerMatrix } from '../BulvarPowerMatrix';
import { BulvarProductionOpsTable } from './BulvarProductionOrderTable';
import { ProductionTask } from '@/types/bi';
import { BackToHome } from '../BackToHome';
import { BulvarDistributionModal } from '../BulvarDistributionModal';
import { BulvarProductionDetailModal } from '../BulvarProductionDetailModal';
import { BulvarDistributionControlPanel } from './BulvarDistributionControlPanel';
import BulvarProductionSimulator from './BulvarProductionSimulator';
import { BulvarHistoricalProduction } from './BulvarHistoricalProduction';
import { ThemeToggle } from '../theme-toggle';

// --- SUPPORTING COMPONENTS ---
interface ProductionItem {
    product_name: string;
    baked_at_factory: number;
    unit?: 'шт' | 'кг' | string;
}

interface ProductionDetailViewProps {
    products: ProductionTask[];
}

const ProductionDetailView = ({ products }: ProductionDetailViewProps) => {
    const unitByProductName = React.useMemo(() => {
        const map = new Map<string, string>();
        for (const product of products) {
            if (!product.name) continue;
            map.set(product.name.trim().toLowerCase(), product.unit || 'шт');
        }
        return map;
    }, [products]);

    const { data, error, isLoading } = useSWR<ProductionItem[]>(
        '/api/bulvar/production-detail',
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
                        <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Статистика Виробництва</h2>
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
                                <th className="p-4">Бульвар-Автовокзал</th>
                                <th className="p-4 text-center">Сьогодні (од.)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-panel-border">
                            {data.map((item, i) => (
                                <tr key={i} className="group hover:bg-bg-primary transition-colors">
                                    <td className="p-4 text-sm font-medium text-text-primary group-hover:text-accent-primary">
                                        {item.product_name}
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="inline-flex items-center justify-center px-4 py-1.5 rounded-lg bg-accent-primary/10 text-accent-primary font-mono text-sm font-black min-w-[4rem] border border-accent-primary/20">
                                            {item.baked_at_factory} <span className="text-[10px] ml-1 opacity-70 lowercase">{unitByProductName.get(item.product_name.trim().toLowerCase()) || item.unit || 'шт'}</span>
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

export const BulvarProductionTabs = ({ data, onRefresh, showTabs = true }: Props) => {
    const [activeTab, setActiveTab] = useState<'orders' | 'matrix' | 'production' | 'history' | 'logistics' | 'simulator'>('matrix');
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
            setIsStale(diff > 30 * 60 * 1000);
        };
        checkStaleness();
        const interval = setInterval(checkStaleness, 60000);
        return () => clearInterval(interval);
    }, [lastUpdated]);

    const handleUpdateStock = async () => {
        setIsUpdatingStock(true);
        try {
            const response = await fetch('/api/bulvar/update-stock', {
                method: 'POST',
                credentials: 'include',
            });

            const result = await response.json();

            if (result.success) {
                setStockData(result.data);
                if (result.manufactures) {
                    setManufacturedData(result.manufactures);
                }
                setLastUpdated(new Date());
            }
        } catch (error) {
            console.error('[Stock Update] Error:', error);
        } finally {
            setIsUpdatingStock(false);
        }
    };

    React.useEffect(() => {
        if (hasAutoSyncedRef.current) return;
        hasAutoSyncedRef.current = true;
        void handleUpdateStock();
    }, []);

    const displayData = useMemo(() => {
        if (!stockData || !Array.isArray(stockData)) return data;
        const cleanStr = (s: string) => s.toLowerCase().replace(/[^а-яіїєґa-z0-9]/g, '');

        return data.map(product => {
            let totalNetworkStock = 0;
            const targetNameMap = cleanStr(product.name);

            const enrichedStores = (product.stores || []).map(store => {
                const cleanStoreName = cleanStr(store.storeName);
                const matchingStorage = stockData.find((s: any) => {
                    const sName = cleanStr(s.storage_name);
                    const coreName = sName.replace('магазин', '');
                    return (coreName.length > 2 && cleanStoreName.includes(coreName)) || sName.includes(cleanStoreName);
                });

                let newStock = Number(store.currentStock) || 0;
                if (cleanStoreName.includes('кондитерка') || cleanStoreName.includes('цех')) {
                    newStock = 0;
                } else if (matchingStorage && matchingStorage.leftovers) {
                    const leftover = matchingStorage.leftovers.find((l: any) => cleanStr(l.ingredient_name || '') === targetNameMap);
                    if (leftover) {
                        newStock = Math.max(0, parseFloat(leftover.storage_ingredient_left || '0'));
                    }
                }
                totalNetworkStock += newStock;
                return { ...store, currentStock: newStock };
            });

            const needNet = Math.max(0, product.minStockThresholdKg - totalNetworkStock);
            return {
                ...product,
                totalStockKg: totalNetworkStock,
                stores: enrichedStores,
                totalDeficitKg: needNet,
                recommendedQtyKg: needNet <= 0 ? 0 : Math.ceil(needNet / 10) * 10,
                deficitPercent: product.minStockThresholdKg > 0 ? Number(((needNet / product.minStockThresholdKg) * 100).toFixed(1)) : 0,
                outOfStockStores: enrichedStores.filter(s => s.currentStock <= 0).length,
            } as ProductionTask;
        });
    }, [data, stockData]);

    const globalMetrics = useMemo(() => {
        let totalStock = 0, totalMin = 0, totalProduced = 0;
        displayData.forEach(p => {
            totalStock += (p.totalStockKg || 0);
            totalMin += (Number(p.minStockThresholdKg) || 0);
        });
        if (manufacturedData && manufacturedData.length > 0) {
            manufacturedData.forEach((mItem: any) => {
                totalProduced += parseFloat(mItem.product_num || '0');
            });
        }
        return {
            total: {
                stock: totalStock,
                min: totalMin,
                index: totalMin > 0 ? (totalStock / totalMin) * 100 : 0,
                produced: totalProduced
            }
        };
    }, [displayData, manufacturedData]);

    // --- SUB-COMPONENTS FOR STANDARD DASHBOARD UI ---
    const MetricCard = ({ title, value, unit, icon: Icon, color }: any) => (
        <div className="bg-panel-bg border border-panel-border rounded-xl px-4 py-4 shadow-[var(--panel-shadow)] flex items-center justify-between gap-4 transition-all cursor-pointer hover:border-accent-primary/30 hover:shadow-[var(--panel-shadow-strong)]">
            <div className="min-w-0">
                <div className="text-[10px] text-text-secondary font-bold uppercase tracking-widest mb-1">{title}</div>
                <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-text-primary">{value}</span>
                    <span className="text-[10px] text-text-secondary font-medium">{unit}</span>
                </div>
            </div>
            <div className="p-3 rounded-lg bg-accent-primary/10 border border-accent-primary/20 transition-colors">
                <Icon size={20} style={{ color }} />
            </div>
        </div>
    );

    const getIndexColor = (val: number) => {
        if (val >= 96) return "var(--accent-primary)";
        if (val >= 80) return "#EAB308";
        return "#EF4444";
    };

    return (
        <div className="flex flex-col h-full w-full bg-bg-primary font-sans text-text-primary">
            {/* 1. HEADER & MONITORING BLOCK */}
            <header className="flex-shrink-0 p-3 lg:p-4 pb-1 lg:pb-2 z-20">
                <div className="flex flex-col gap-4">
                    {/* Top Row: Navigation & Title */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <BackToHome />
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-10 rounded-lg bg-panel-bg border border-panel-border flex items-center justify-center shadow-[var(--panel-shadow)]">
                                    <ChefHat size={22} className="text-accent-primary" />
                                </div>
                                <div className="flex flex-col justify-center">
                                    <h1 className="text-xl font-bold text-text-primary uppercase tracking-wide leading-none">ЦЕХ БУЛЬВАР-АВТОВОКЗАЛ</h1>
                                    <div className="text-[9px] text-text-secondary uppercase tracking-widest mt-1 font-bold">
                                        МЕНЕДЖЕР РОЗПОДІЛУ
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleUpdateStock}
                                disabled={isUpdatingStock}
                                className={cn(
                                    "h-9 px-4 flex items-center gap-2 border rounded transition-all text-[11px] font-bold uppercase",
                                    isUpdatingStock
                                        ? "bg-bg-primary text-text-muted cursor-not-allowed border-panel-border"
                                        : isStale
                                            ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
                                            : "bg-accent-primary border-accent-primary text-white hover:opacity-90 shadow-sm"
                                )}
                            >
                                <RefreshCw size={14} className={cn(isUpdatingStock && "animate-spin")} />
                                {isUpdatingStock ? 'Синхронізація...' : 'Оновити залишки'}
                            </button>
                            <ThemeToggle />
                        </div>
                    </div>

                    {/* Second Row: Monitoring Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 my-1">
                        <div onClick={() => setActiveTab('production')}>
                        <MetricCard
                            title="Сьогодні Вироблено"
                            value={globalMetrics.total.produced.toLocaleString()}
                            unit="од."
                            icon={ChefHat}
                            color="var(--accent-primary)"
                        />
                    </div>
                    <MetricCard
                        title="Факт залишок"
                        value={globalMetrics.total.stock.toLocaleString()}
                        unit="од."
                        icon={Activity}
                        color="var(--text-secondary)"
                    />
                    <MetricCard
                        title="Норма"
                        value={globalMetrics.total.min.toLocaleString()}
                        unit="од."
                        icon={CheckCircle}
                        color="var(--text-secondary)"
                    />
                        <MetricCard
                            title="Індекс заповненості"
                            value={`${globalMetrics.total.index.toFixed(0)}%`}
                            unit=""
                            icon={Percent}
                            color={getIndexColor(globalMetrics.total.index)}
                        />
                    </div>

                    {/* Third Row: Tabs Container (CONDITIONAL) */}
                    {showTabs && (
                        <div className="flex items-center gap-1 p-1 bg-panel-bg rounded border border-panel-border shadow-[var(--panel-shadow)]">
                            <button
                                onClick={() => setActiveTab('matrix')}
                                className={cn(
                                    "px-4 h-[38px] text-[11px] font-bold uppercase tracking-wider rounded transition-all flex items-center gap-2 shadow-sm",
                                    activeTab === 'matrix'
                                        ? "bg-accent-primary text-white border border-accent-primary"
                                        : "text-text-secondary hover:bg-bg-primary hover:text-text-primary border border-transparent"
                                )}
                            >
                                <Activity size={14} />
                                <span className="hidden xl:inline">Поточний стан</span>
                                <span className="xl:hidden">СТАН</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('production')}
                                className={cn(
                                    "px-4 h-[38px] text-[11px] font-bold uppercase tracking-wider rounded transition-all flex items-center gap-2 shadow-sm",
                                    activeTab === 'production'
                                        ? "bg-accent-primary text-white border border-accent-primary"
                                        : "text-text-secondary hover:bg-bg-primary hover:text-text-primary border border-transparent"
                                )}
                            >
                                <ChefHat size={14} />
                                <span className="hidden xl:inline">Виробництво</span>
                                <span className="xl:hidden">PROD</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('logistics')}
                                className={cn(
                                    "px-4 h-[38px] text-[11px] font-bold uppercase tracking-wider rounded transition-all flex items-center gap-2 shadow-sm",
                                    activeTab === 'logistics'
                                        ? "bg-accent-primary text-white border border-accent-primary"
                                        : "text-text-secondary hover:bg-bg-primary hover:text-text-primary border border-transparent"
                                )}
                            >
                                <Truck size={14} />
                                <span className="hidden xl:inline">Логістика</span>
                                <span className="xl:hidden">LOG</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('history')}
                                className={cn(
                                    "px-4 h-[38px] text-[11px] font-bold uppercase tracking-wider rounded transition-all flex items-center gap-2 shadow-sm",
                                    activeTab === 'history'
                                        ? "bg-accent-primary text-white border border-accent-primary"
                                        : "text-text-secondary hover:bg-bg-primary hover:text-text-primary border border-transparent"
                                )}
                            >
                                <TrendingUp size={14} />
                                <span className="hidden xl:inline">180 днів</span>
                                <span className="xl:hidden">180D</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('simulator')}
                                className={cn(
                                    "px-4 h-[38px] text-[11px] font-bold uppercase tracking-wider rounded transition-all flex items-center gap-2 shadow-sm",
                                    activeTab === 'simulator'
                                        ? "bg-accent-primary text-white border border-accent-primary"
                                        : "text-text-secondary hover:bg-bg-primary hover:text-text-primary border border-transparent"
                                )}
                            >
                                <Settings2 size={14} />
                                <span className="hidden xl:inline">Симулятор</span>
                                <span className="xl:hidden">SIM</span>
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {/* 2. CONTENT BLOCK */}
            <div className="flex-1 overflow-hidden relative">
                {(!showTabs || activeTab === 'orders') && (
                    <BulvarProductionOpsTable data={displayData} onRefresh={onRefresh} />
                )}
                {(showTabs && activeTab === 'matrix') && (
                    <BulvarPowerMatrix data={displayData} onRefresh={onRefresh} />
                )}
                {(showTabs && activeTab === 'production') && (
                    <ProductionDetailView products={data} />
                )}
                {(showTabs && activeTab === 'logistics') && (
                    <BulvarDistributionControlPanel />
                )}
                {(showTabs && activeTab === 'history') && (
                    <BulvarHistoricalProduction />
                )}
                {(showTabs && activeTab === 'simulator') && (
                    <BulvarProductionSimulator />
                )}
            </div>

            {/* MODALS */}
            <BulvarDistributionModal
                isOpen={showDistModal}
                onClose={() => setShowDistModal(false)}
                products={displayData}
            />
            <BulvarProductionDetailModal
                isOpen={showProductionModal}
                onClose={() => setShowProductionModal(false)}
            />
        </div>
    );
};
