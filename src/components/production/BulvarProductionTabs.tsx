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
import { getBulvarUnit } from '@/lib/bulvar-dictionary';

// --- SUPPORTING COMPONENTS ---
interface ProductionItem {
    product_name: string;
    baked_at_factory: number;
    total_qty_180d?: number;
    prod_days?: number;
    avg_qty_per_prod_day?: number;
    last_manufacture_at?: string;
}

const ProductionDetailView = () => {
    const { data, error, isLoading } = useSWR<ProductionItem[]>(
        '/api/bulvar/production-detail',
        (url) => fetch(url, { credentials: 'include' }).then(r => r.json()),
        { refreshInterval: 10000 }
    );

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-6 bg-[#F7F7F7]">
            <div className="x-panel overflow-hidden">
                <div className="x-title">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#1ABB9C]/10 flex items-center justify-center">
                            <ChefHat size={16} className="text-[#1ABB9C]" />
                        </div>
                        <h2 className="uppercase">Статистика Виробництва</h2>
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Останні 24 год</div>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                        <Loader2 size={32} className="animate-spin text-[#1ABB9C]" />
                        <span className="text-xs font-mono uppercase tracking-widest">Завантаження...</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center py-20 text-red-500 gap-3">
                        <AlertCircle size={32} />
                        <span className="text-sm font-bold">Помилка завантаження</span>
                    </div>
                ) : data && data.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-[#F9FAFB] text-[10px] uppercase font-bold tracking-widest text-[#73879C] border-b border-[#D9DEE4]">
                            <tr>
                                <th className="p-4">Бульвар-Автовокзал</th>
                                <th className="p-4 text-center">Сьогодні (од.)</th>
                                <th className="p-4 text-center">За 180 дн.</th>
                                <th className="p-4 text-center">Виходів</th>
                                <th className="p-4 text-right">Сер / варку</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#D9DEE4]">
                            {data.map((item, i) => (
                                <tr key={i} className="group hover:bg-[#F7F7F7] transition-colors">
                                    <td className="p-4 text-sm font-medium text-[#2A3F54] group-hover:text-[#1ABB9C]">
                                        {item.product_name}
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="inline-flex items-center justify-center px-4 py-1.5 rounded-lg bg-[#1ABB9C]/10 text-[#1ABB9C] font-mono text-sm font-black min-w-[4rem] border border-[#1ABB9C]/20">
                                            {item.baked_at_factory} <span className="text-[10px] ml-1 opacity-70 lowercase">{getBulvarUnit(item.product_name)}</span>
                                        </span>
                                    </td>
                                    <td className="p-4 text-center text-sm font-mono text-[#73879C]">
                                        {item.total_qty_180d?.toLocaleString() || 0}
                                    </td>
                                    <td className="p-4 text-center text-sm font-mono text-[#BDC3C7]">
                                        {item.prod_days || 0}
                                    </td>
                                    <td className="p-4 text-right">
                                        <span className="text-sm font-mono font-bold text-[#1ABB9C]">
                                            {Number(item.avg_qty_per_prod_day || 0).toFixed(1)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-300">
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

    // --- SUB-COMPONENTS FOR ADMIN UI (Gentelella Style) ---
    const MetricCard = ({ title, value, unit, icon: Icon, color }: any) => (
        <div className="x-panel !mb-0 flex items-center justify-between group hover:border-[#1ABB9C] transition-all cursor-pointer">
            <div>
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">{title}</div>
                <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-[#2A3F54]" style={{ color: value === 0 ? '#BDC3C7' : undefined }}>{value}</span>
                    <span className="text-[10px] text-gray-400 font-medium">{unit}</span>
                </div>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 group-hover:bg-[#1ABB9C]/10 transition-colors">
                <Icon size={20} style={{ color }} />
            </div>
        </div>
    );

    const getIndexColor = (val: number) => {
        if (val >= 96) return "#1ABB9C";
        if (val >= 80) return "#FFB800";
        return "#E74856";
    };

    return (
        <div className="flex flex-col h-full w-full bg-[#F7F7F7] font-sans">
            {/* 1. HEADER & MONITORING BLOCK */}
            <header className="flex-shrink-0 p-3 lg:p-4 pb-1 lg:pb-2 z-20">
                <div className="flex flex-col gap-4">
                    {/* Top Row: Navigation & Title */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <BackToHome />
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                                    <ChefHat size={22} className="text-[#1ABB9C]" />
                                </div>
                                <div className="flex flex-col justify-center">
                                    <h1 className="text-xl font-bold text-[#2A3F54] uppercase tracking-wide leading-none">ЦЕХ БУЛЬВАР-АВТОВОКЗАЛ</h1>
                                    <div className="text-[9px] text-gray-400 uppercase tracking-widest mt-1 font-bold">
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
                                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                        : isStale
                                            ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
                                            : "bg-[#1ABB9C] border-[#1ABB9C] text-white hover:opacity-90 shadow-sm"
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
                                color="#1ABB9C"
                            />
                        </div>
                        <MetricCard
                            title="Факт залишок"
                            value={globalMetrics.total.stock.toLocaleString()}
                            unit="од."
                            icon={Activity}
                            color="#34495E"
                        />
                        <MetricCard
                            title="Норма"
                            value={globalMetrics.total.min.toLocaleString()}
                            unit="од."
                            icon={CheckCircle}
                            color="#34495E"
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
                        <div className="flex items-center gap-1 p-1 bg-white rounded border border-gray-200 shadow-sm">
                            <button
                                onClick={() => setActiveTab('matrix')}
                                className={cn(
                                    "px-4 h-[38px] text-[11px] font-bold uppercase tracking-wider rounded transition-all flex items-center gap-2 shadow-sm",
                                    activeTab === 'matrix'
                                        ? "bg-[#2A3F54] text-white border border-[#2A3F54]"
                                        : "text-[#73879C] hover:bg-gray-50 hover:text-[#2A3F54] border border-transparent"
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
                                        ? "bg-[#2A3F54] text-white border border-[#2A3F54]"
                                        : "text-[#73879C] hover:bg-gray-50 hover:text-[#2A3F54] border border-transparent"
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
                                        ? "bg-[#2A3F54] text-white border border-[#2A3F54]"
                                        : "text-[#73879C] hover:bg-gray-50 hover:text-[#2A3F54] border border-transparent"
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
                                        ? "bg-[#2A3F54] text-white border border-[#2A3F54]"
                                        : "text-[#73879C] hover:bg-gray-50 hover:text-[#2A3F54] border border-transparent"
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
                                        ? "bg-[#2A3F54] text-white border border-[#2A3F54]"
                                        : "text-[#73879C] hover:bg-gray-50 hover:text-[#2A3F54] border border-transparent"
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
                    <ProductionDetailView />
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
