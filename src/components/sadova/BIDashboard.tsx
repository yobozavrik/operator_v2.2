'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { supabase } from '@/lib/supabase';
import { ProductionTask, BI_Metrics, SupabaseDeficitRow } from '@/types/bi';
import { transformDeficitData } from '@/lib/transformers';
import { SyncOverlay } from '@/components/SyncOverlay';
import { cn } from '@/lib/utils';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { BackToHome } from '@/components/BackToHome';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BIPowerMatrix } from '@/components/BIPowerMatrix';
import { StoreSpecificView } from '@/components/StoreSpecificView';
import { PersonnelView } from '@/components/PersonnelView';
import { useStore } from '@/context/StoreContext';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useToast, AlertBanner } from '@/components/ui';
import { ContextBridge } from '@/components/context-bridge';

import { authedFetcher } from '@/lib/authed-fetcher';
const fetcher = authedFetcher;

const LABEL_TO_SLUG: Record<string, string> = {
    'Магазин "Садгора"': 'sadgora',
    'Магазин "Компас"': 'kompas',
    'Магазин "Руська"': 'ruska',
    'Магазин "Хотинська"': 'hotynska',
    'Магазин "Білоруська"': 'biloruska',
    'Магазин "Кварц"': 'kvarc',
};

const normalizeName = (value: string): string => {
    if (!value) return '';
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
};

import {
    MapPin,
    ArrowLeft,
    BarChart2,
    RefreshCw,
    Users,
    Truck,
    Activity,
    AlertTriangle,
    ChevronRight,
    ClipboardList,
    LogOut,
    AlertCircle,
    LayoutDashboard,
    Network,
    Factory
} from 'lucide-react';

const SignalCard = ({ label, value, note, tone = 'neutral' }: { label: string; value: string; note: string; tone?: 'neutral' | 'critical' }) => (
    <div className={cn(
        'rounded-2xl border bg-white p-4 shadow-sm',
        tone === 'critical' ? 'border-red-200' : 'border-slate-200'
    )}>
        <div className={cn('text-[10px] uppercase tracking-[0.18em] font-bold', tone === 'critical' ? 'text-red-700' : 'text-slate-500')}>
            {label}
        </div>
        <div className={cn('mt-2 text-3xl font-bold leading-none', tone === 'critical' ? 'text-red-700' : 'text-slate-900')}>
            {value}
        </div>
        <div className="mt-2 text-xs leading-5 text-slate-600">{note}</div>
    </div>
);

const Clock = () => {
    const [currentTime, setCurrentTime] = React.useState(new Date());

    React.useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const formattedDate = React.useMemo(() => {
        const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        const parts = new Intl.DateTimeFormat('uk-UA', options).formatToParts(currentTime);
        const weekday = parts.find(p => p.type === 'weekday')?.value || '';
        const day = parts.find(p => p.type === 'day')?.value || '';
        const month = parts.find(p => p.type === 'month')?.value || '';
        const year = parts.find(p => p.type === 'year')?.value || '';
        const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
        return `${capitalize(weekday)}, ${day} ${capitalize(month)} ${year}`;
    }, [currentTime]);

    const formattedTime = currentTime.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return (
        <div className="min-w-[220px] rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-right">
            <div className="text-xs text-slate-500 font-medium mb-1">{formattedDate}</div>
            <div className="text-4xl font-bold text-slate-900 leading-none">{formattedTime}</div>
        </div>
    );
};


export const BIDashboard = () => {
    // Get store context
    const { selectedStore, setSelectedStore, currentCapacity } = useStore();
    const router = useRouter();
    const toast = useToast();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [realtimeEnabled, setRealtimeEnabled] = React.useState(true);
    const refreshInterval = realtimeEnabled ? 0 : 30000;

    const { data: deficitData, error: deficitError, mutate: mutateDeficit } = useSWR<SupabaseDeficitRow[]>(
        '/api/sadova/deficit',
        fetcher,
        { refreshInterval }
    );

    const { data: metrics, error: metricsError, mutate: mutateMetrics } = useSWR<BI_Metrics>(
        '/api/sadova/metrics',
        fetcher,
        { refreshInterval }
    );

    const { data: allProductsData, error: allProductsError, mutate: mutateAllProducts } = useSWR<SupabaseDeficitRow[]>(
        '/api/sadova/all-products',
        fetcher,
        { refreshInterval }
    );

    React.useEffect(() => {
        const channel = supabase
            .channel('dashboard-updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'dashboard_deficit' },
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (payload: any) => {
                    mutateDeficit();
                    mutateMetrics();
                    mutateAllProducts();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [mutateDeficit, mutateMetrics, mutateAllProducts]);

    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [lastManualRefresh, setLastManualRefresh] = React.useState<number | null>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('lastManualRefresh');
            return saved ? parseInt(saved, 10) : null;
        }
        return null;
    });

    const [dynamicMetrics, setDynamicMetrics] = React.useState<{
        totalKg: number;
        criticalWeight: number;
        reserveWeight: number;
        criticalSKU: number;
        reserveSKU: number;
    } | null>(null);

    const [planningDays, setPlanningDays] = React.useState(1);
    const [posterData, setPosterData] = React.useState<any[] | null>(null);
    const [posterManufactures, setPosterManufactures] = React.useState<any[] | null>(null);
    const [posterCatalog, setPosterCatalog] = React.useState<any[] | null>(null);
    const [posterShops, setPosterShops] = React.useState<any[] | null>(null);
    const [lastLiveSyncAt, setLastLiveSyncAt] = React.useState<string | null>(null);
    const [manufacturesWarning, setManufacturesWarning] = React.useState(false);
    const [productionSummary, setProductionSummary] = React.useState<{
        total_kg: number;
        storage_id: number;
        items_count: number;
    } | null>(null);

    const normalizeName = (value: string): string => {
        if (!value) return '';
        return value.trim().toLowerCase().replace(/\s+/g, ' ');
    };

    const syncMatchStats = useMemo(() => {
        if (!allProductsData || !posterData || !posterShops) return null;

        const shopBySpotId = new Map(posterShops.map(s => [s.spot_id, s]));
        const liveStocksByStorageAndName = new Map(
            posterData.map(s => [`${s.storage_id}::${s.ingredient_name_normalized}`, s])
        );

        let totalExpected = 0;
        let totalMatched = 0;
        const shopStats = new Map<number, { expected: number, matched: number, name: string }>();

        allProductsData.forEach(row => {
            const shop = shopBySpotId.get(row.код_магазину);
            if (!shop) return;

            if (!shopStats.has(shop.storage_id)) {
                shopStats.set(shop.storage_id, { expected: 0, matched: 0, name: shop.spot_name });
            }
            const stats = shopStats.get(shop.storage_id)!;
            stats.expected++;
            totalExpected++;

            const key = `${shop.storage_id}::${normalizeName(row.назва_продукту)}`;
            if (liveStocksByStorageAndName.has(key)) {
                stats.matched++;
                totalMatched++;
            }
        });

        return {
            totalExpected,
            totalMatched,
            percent: totalExpected > 0 ? (totalMatched / totalExpected) * 100 : 0,
            shopStats: Array.from(shopStats.entries()).map(([id, s]) => ({
                id,
                ...s,
                percent: s.expected > 0 ? (s.matched / s.expected) * 100 : 0
            }))
        };
    }, [allProductsData, posterData, posterShops]);


    const totalProductionKg = productionSummary?.total_kg || 0;






    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            const response = await fetch('/api/sadova/sync-stocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const result = await response.json();

            if (response.ok && result.success) {
                setPosterData(result.live_stocks || []);
                setPosterManufactures(result.manufactures || []);
                setPosterCatalog(result.catalog || []);
                setPosterShops(result.shops || []);
                setLastLiveSyncAt(result.timestamp);
                setManufacturesWarning(!!result.manufactures_warning);
                setProductionSummary(result.production_summary || null);

                const now = Date.now();
                setLastManualRefresh(now);
                localStorage.setItem('lastManualRefresh', now.toString());

                // Revalidate UI data
                await Promise.all([mutateDeficit(), mutateMetrics(), mutateAllProducts()]);

                if (result.partial_sync) {
                    const failedNames = (result.failed_storages || [])
                        .map((id: number) => result.shops?.find((s: any) => s.storage_id === id)?.spot_name || `ID ${id}`)
                        .join(', ');
                    toast.warning('Часткова синхронізація', `Не вдалося отримати онлайн-дані для: ${failedNames}. Використовуються застарілі залишки.`);
                } else if (result.manufactures_warning) {
                    toast.warning('Залишки оновлено', 'Виробництво за сьогодні недоступне, показано онлайн-залишки без корекції цеху');
                } else {
                    toast.success('Дані оновлено', 'Залишки синхронізовано з Poster');
                }
            } else {
                throw new Error(result.error || 'Sync failed');
            }
        } catch (err: any) {
            console.error('Refresh error:', err);
            toast.error('Помилка оновлення', `Не вдалося отримати онлайн-залишки з Poster: ${err.message}`);
        } finally {
            setIsRefreshing(false);
        }
    };

    const mergedDeficitData = useMemo(() => {
        if (!deficitData || !Array.isArray(deficitData)) return [];
        if (!posterData || !posterShops) return deficitData;

        // Step 10: Build lookup maps
        const shopBySpotId = new Map(posterShops.map(s => [s.spot_id, s]));
        const liveStocksByStorageAndName = new Map(
            posterData.map(s => [`${s.storage_id}::${s.ingredient_name_normalized}`, s])
        );
        const manufacturedQtyByStorageAndName = new Map();
        if (posterManufactures) {
            posterManufactures.forEach(m => {
                const key = `${m.storage_id}::${m.product_name_normalized}`;
                manufacturedQtyByStorageAndName.set(key, (manufacturedQtyByStorageAndName.get(key) || 0) + m.quantity);
            });
        }

        return deficitData.map(row => {
            const spotId = row.код_магазину;
            const shop = shopBySpotId.get(spotId);
            const storageId = shop?.storage_id;
            const normalizedName = normalizeName(row.назва_продукту);

            let updatedStock = row.current_stock;
            let liveStockEntry = null;
            if (storageId) {
                const stockKey = `${storageId}::${normalizedName}`;
                liveStockEntry = liveStocksByStorageAndName.get(stockKey);
                if (liveStockEntry) {
                    updatedStock = liveStockEntry.stock_left;
                }
            }

            // --- Sadova specific logic (dynamic hub flag) ---
            if (shop?.is_production_hub && storageId) {
                const prodKey = `${storageId}::${normalizedName}`;
                const manufacturedToday = manufacturedQtyByStorageAndName.get(prodKey) || 0;
                updatedStock = updatedStock - manufacturedToday;
            }

            return {
                ...row,
                current_stock: updatedStock,
                is_live: !!liveStockEntry
            };
        });
    }, [deficitData, posterData, posterManufactures, posterShops]);

    const mergedAllProductsData = useMemo(() => {
        if (!allProductsData || !Array.isArray(allProductsData)) return [];
        if (!posterData || !posterShops) return allProductsData;

        const shopBySpotId = new Map(posterShops.map(s => [s.spot_id, s]));
        const liveStocksByStorageAndName = new Map(
            posterData.map(s => [`${s.storage_id}::${s.ingredient_name_normalized}`, s])
        );
        const manufacturedQtyByStorageAndName = new Map();
        if (posterManufactures) {
            posterManufactures.forEach(m => {
                const key = `${m.storage_id}::${m.product_name_normalized}`;
                manufacturedQtyByStorageAndName.set(key, (manufacturedQtyByStorageAndName.get(key) || 0) + m.quantity);
            });
        }

        return allProductsData.map(row => {
            const spotId = row.код_магазину;
            const shop = shopBySpotId.get(spotId);
            const storageId = shop?.storage_id;
            const normalizedName = normalizeName(row.назва_продукту);

            let updatedStock = row.current_stock;
            let liveStockEntry = null;
            if (storageId) {
                const stockKey = `${storageId}::${normalizedName}`;
                liveStockEntry = liveStocksByStorageAndName.get(stockKey);
                if (liveStockEntry) {
                    updatedStock = liveStockEntry.stock_left;
                }
            }

            if (shop?.is_production_hub && storageId) {
                const prodKey = `${storageId}::${normalizedName}`;
                const manufacturedToday = manufacturedQtyByStorageAndName.get(prodKey) || 0;
                updatedStock = updatedStock - manufacturedToday;
            }

            return {
                ...row,
                current_stock: updatedStock,
                is_live: !!liveStockEntry
            };
        });
    }, [allProductsData, posterData, posterManufactures, posterShops]);

    const deficitQueue = useMemo((): ProductionTask[] => {
        if (!mergedDeficitData) return [];
        const transformed = transformDeficitData(mergedDeficitData);

        if (posterManufactures && posterShops) {
            const manufacturedQtyByStorageAndName = new Map();
            posterManufactures.forEach(m => {
                const key = `${m.storage_id}::${m.product_name_normalized}`;
                manufacturedQtyByStorageAndName.set(key, (manufacturedQtyByStorageAndName.get(key) || 0) + m.quantity);
            });

            const productionHubStorageId = posterShops.find(s => s.is_production_hub)?.storage_id;

            if (productionHubStorageId) {
                return transformed.map(task => {
                    const prodKey = `${productionHubStorageId}::${normalizeName(task.name)}`;
                    const manufacturedToday = manufacturedQtyByStorageAndName.get(prodKey) || 0;
                    return { ...task, todayProduction: manufacturedToday };
                });
            }
        }
        return transformed;
    }, [mergedDeficitData, posterManufactures, posterShops]);

    const allProductsQueue = useMemo((): ProductionTask[] => {
        if (!mergedAllProductsData) return [];
        const transformed = transformDeficitData(mergedAllProductsData);

        if (posterManufactures && posterShops) {
            const manufacturedQtyByStorageAndName = new Map();
            posterManufactures.forEach(m => {
                const key = `${m.storage_id}::${m.product_name_normalized}`;
                manufacturedQtyByStorageAndName.set(key, (manufacturedQtyByStorageAndName.get(key) || 0) + m.quantity);
            });

            const productionHubStorageId = posterShops.find(s => s.is_production_hub)?.storage_id;

            if (productionHubStorageId) {
                return transformed.map(task => {
                    const prodKey = `${productionHubStorageId}::${normalizeName(task.name)}`;
                    const manufacturedToday = manufacturedQtyByStorageAndName.get(prodKey) || 0;
                    return { ...task, todayProduction: manufacturedToday };
                });
            }
        }
        return transformed;
    }, [mergedAllProductsData, posterManufactures, posterShops]);

    const dynamicStores = useMemo(() => {
        if (!deficitQueue || !Array.isArray(deficitQueue)) return [];

        const storeMap = new Map<string, boolean>();
        deficitQueue.forEach(task => {
            task.stores.forEach(s => {
                if (s.storeName && s.storeName !== 'Остаток на Складе') {
                    storeMap.set(s.storeName, true);
                }
            });
        });

        const storeNames = Array.from(storeMap.keys()).sort();

        return storeNames.map(name => {
            const cleanName = name.replace('Магазин "', '').replace('"', '');
            return {
                id: name,
                name: cleanName,
                icon: null
            };
        });
    }, [deficitQueue]);

    const handleStoreClick = (id: string) => {
        if (id === 'logistics') {
            router.push('/sadova/delivery');
        } else if (id === 'Планування') {
            router.push('/production/sadova/plan');
        } else if (id === 'Усі') {
            router.push('/sadova');
            setSelectedStore('Усі');
        } else {
            const slug = LABEL_TO_SLUG[id];
            if (slug) {
                router.push(`/sadova/${slug}`);
            }
            setSelectedStore(id);
        }
    };

    // Aggregate Product Deficits
    const aggregatedProducts = useMemo(() => {
        return deficitQueue
            .map(task => {
                const totalDeficit = task.stores.reduce((sum, store) => sum + (store.deficitKg || 0), 0);
                return { name: task.name, deficit: totalDeficit };
            })
            .filter(p => p.deficit > 0)
            .sort((a, b) => b.deficit - a.deficit);
    }, [deficitQueue]);

    const isPersonnelMode = (selectedStore as string) === 'Персонал';
    const isSpecificStore = selectedStore !== 'Усі' && !isPersonnelMode && selectedStore !== 'Планування';
    const storeSpecificQueue = useMemo(() => {
        if (!isSpecificStore) return [];
        return deficitQueue
            .map(task => {
                const storeData = task.stores.find(s => s.storeName === selectedStore);
                if (!storeData || (!storeData.deficitKg && !storeData.recommendedKg)) return null;
                return {
                    ...task,
                    stores: [storeData],
                    recommendedQtyKg: storeData.deficitKg > 0 ? storeData.deficitKg : storeData.recommendedKg, // Prioritize urgent deficit explicitly
                } as ProductionTask;
            })
            .filter((item): item is ProductionTask => item !== null);
    }, [deficitQueue, selectedStore, isSpecificStore]);

    if (deficitError || metricsError || allProductsError) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#0B0F19] text-[#E74856] font-bold uppercase tracking-widest font-display" role="alert">
                <AlertCircle size={48} className="mb-4 animate-pulse" />
                <span className="block text-center">Помилка даних | база недоступна</span>
            </div>
        );
    }

    if (!deficitData || !metrics || !allProductsData) {
        return (
            <div className="min-h-screen bg-[#0B0F19] p-8 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 border-4 border-[#00D4FF] border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-[#00D4FF] font-display tracking-widest animate-pulse">ЗАВАНТАЖЕННЯ СИСТЕМИ...</div>
                </div>
            </div>
        );
    }

    const displayTotalKg = dynamicMetrics ? dynamicMetrics.totalKg : Math.round(metrics.shopLoad);
    const displayCriticalSKU = dynamicMetrics ? dynamicMetrics.criticalSKU : metrics.criticalSKU;
    const recommendedLoad = currentCapacity || 0;
    const loadPercent = recommendedLoad > 0 ? Math.round((displayTotalKg / recommendedLoad) * 100) : 0;

    return (
        <div className="bg-slate-100 text-slate-900 antialiased overflow-hidden h-screen flex font-sans">
            <SyncOverlay isVisible={isRefreshing} />

            {/* Sidebar */}
            <aside className="w-72 h-full flex flex-col border-r border-slate-200 bg-white z-20 relative flex-shrink-0">
                <div className="p-5 border-b border-slate-200">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">Гравітон</div>
                        <div className="mt-1 text-xl font-bold text-slate-900">Дефіцити мережі</div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 custom-scrollbar">
                    <div>
                        <h3 className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Розділи</h3>
                        <ul className="space-y-2">
                            <li>
                                <button
                                    onClick={() => handleStoreClick('Усі')}
                                    className={cn(
                                        'w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors',
                                        selectedStore === 'Усі'
                                            ? 'border-blue-200 bg-blue-50 text-slate-900'
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    )}
                                >
                                    Операційний огляд
                                </button>
                            </li>
                            <li>
                                <button
                                    onClick={() => router.push('/sadova/delivery')}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                                >
                                    Логістика та розподіл
                                </button>
                            </li>
                            <li>
                                <button
                                    onClick={() => setSelectedStore('Персонал')}
                                    className={cn(
                                        'w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors',
                                        isPersonnelMode
                                            ? 'border-blue-200 bg-blue-50 text-slate-900'
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    )}
                                >
                                    Персонал
                                </button>
                            </li>
                            <li>
                                <button
                                    onClick={() => handleStoreClick('Планування')}
                                    className={cn(
                                        'w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors',
                                        selectedStore === 'Планування'
                                            ? 'border-blue-200 bg-blue-50 text-slate-900'
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    )}
                                >
                                    Планування
                                </button>
                            </li>
                            <li>
                                <button
                                    onClick={() => router.push('/production')}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                                >
                                    Виробництво
                                </button>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <div className="mb-3 flex items-center justify-between px-2">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Магазини</h3>
                            <span className="text-[10px] text-slate-400">{dynamicStores.length}</span>
                        </div>
                        <ul className="space-y-2">
                            {dynamicStores.map((store) => {
                                const isActive = selectedStore === store.id;
                                return (
                                    <li key={store.id}>
                                        <button
                                            onClick={() => handleStoreClick(store.id)}
                                            className={cn(
                                                'w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors',
                                                isActive
                                                    ? 'border-blue-200 bg-blue-50 text-slate-900'
                                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                            )}
                                        >
                                            {store.name}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-200 space-y-2 bg-white">
                    <button
                        onClick={() => router.push('/')}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        Головне меню
                    </button>

                    <button
                        onClick={async () => {
                            await supabase.auth.signOut();
                            window.location.href = '/login';
                        }}
                        className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-medium text-red-700 hover:bg-red-100"
                    >
                        Вихід
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full overflow-hidden relative z-10 bg-transparent">
                <div className="flex-1 flex flex-col p-6 space-y-6 relative z-10 overflow-y-auto custom-scrollbar">
                    <ContextBridge
                        role="Операційний контур"
                        area="Дефіцити мережі / оперативна деталізація"
                        workshop="Гравітон"
                        tone="blue"
                        links={[
                            { href: '/', label: 'Рольовий вхід' },
                            { href: '/ops', label: 'Операційний контур' },
                            { href: '/workshops', label: 'Цехи' },
                        ]}
                    />

                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                        <span className="font-semibold">Роль:</span> Операційний контур · <span className="font-semibold">Фокус:</span> {isSpecificStore ? `магазин ${selectedStore.replace('Магазин "', '').replace('"', '')} — категорії та товари` : 'побачити дефіцит, зрозуміти причину й перейти до дії по мережі.'}
                    </div>

                    {!isSpecificStore && !isPersonnelMode && (
                    <div className="grid grid-cols-12 gap-6 shrink-0">
                        <div className="col-span-12 xl:col-span-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                                        <BarChart2 size={12} />
                                        Операційний центр
                                    </div>
                                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 xl:text-4xl">Гравітон / мережа та дефіцити</h1>
                                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                                        Щоденний екран для відбору позицій у заявку: що критично, де просадка і куди перейти далі.
                                    </p>
                                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-700">1. Сигнал</div>
                                            <div className="mt-2 text-sm font-semibold text-slate-900">Побачити критичні позиції та магазини ризику</div>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">2. Причина</div>
                                            <div className="mt-2 text-sm font-semibold text-slate-900">Зрозуміти, де фактичний залишок нижчий за потребу</div>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">3. Дія</div>
                                            <div className="mt-2 text-sm font-semibold text-slate-900">Обрати позиції, перевірити заявку й передати далі</div>
                                        </div>
                                    </div>
                                </div>

                                <Clock />

                            </div>
                        </div>

                        <div className="col-span-12 xl:col-span-4 grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-1">
                            <SignalCard label="Критичні позиції" value={`${displayCriticalSKU}`} tone="critical" note="Починай розбір саме з них" />
                            <SignalCard label="Загальний обсяг" value={`${Math.round(displayTotalKg)} кг`} tone="neutral" note="Скільки сумарно треба закрити заявкою" />
                            <SignalCard label="Завантаження" value={`${loadPercent}%`} tone="neutral" note={`${Math.round(displayTotalKg)} / ${recommendedLoad} кг поточного ліміту`} />
                        </div>
                    </div>
                    )}

                    {!isSpecificStore && !isPersonnelMode && (
                    <div className="grid grid-cols-12 gap-6 shrink-0">
                        <button
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="col-span-12 lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                        >
                            <div className="flex items-start gap-4">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
                                    <RefreshCw className={cn(isRefreshing ? 'animate-spin' : '')} size={22} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">
                                        {isRefreshing ? 'Синхронізація...' : 'Дія'}
                                    </div>
                                    <div className="mt-1 text-xl font-bold text-slate-900">Оновити залишки мережі</div>
                                    <div className="mt-1 text-sm text-slate-600">Підтягнути фактичні залишки й одразу перерахувати картину дефіцитів.</div>
                                    {lastLiveSyncAt && (
                                        <div className="mt-3 text-xs text-slate-500">
                                            Остання синхронізація: {new Date(lastLiveSyncAt).toLocaleTimeString('uk-UA')}
                                        </div>
                                    )}
                                    {syncMatchStats && (
                                        <div className={cn(
                                            'mt-2 text-xs font-semibold',
                                            syncMatchStats.percent < 95 ? 'text-orange-400' : 'text-status-success'
                                        )}>
                                            Збіг даних: {syncMatchStats.totalMatched}/{syncMatchStats.totalExpected} ({Math.round(syncMatchStats.percent)}%)
                                        </div>
                                    )}
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => router.push('/sadova/delivery')}
                            className="col-span-12 sm:col-span-6 lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:bg-slate-50"
                        >
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 w-fit text-slate-700 mb-4">
                                <Truck size={22} />
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">Наступний крок</div>
                            <div className="mt-1 text-xl font-bold text-slate-900">Розподіл</div>
                            <div className="mt-1 text-sm text-slate-600">Перейти до розподілу, коли дефіцит уже зрозумілий і потрібна дія по мережі.</div>
                            {totalProductionKg > 0 && !manufacturesWarning && (
                                <div className="mt-3 inline-flex rounded-full border border-status-ok/30 bg-status-ok/10 px-2 py-1 text-xs font-semibold text-status-ok">
                                    +{totalProductionKg} кг доступно
                                </div>
                            )}
                        </button>

                        <button
                            onClick={() => setSelectedStore('Персонал')}
                            className={cn(
                                'col-span-12 sm:col-span-6 lg:col-span-3 rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:bg-slate-50',
                                isPersonnelMode ? 'border-blue-200' : 'border-slate-200'
                            )}
                        >
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 w-fit text-slate-700 mb-4">
                                <Users size={22} />
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">Режим</div>
                            <div className="mt-1 text-xl font-bold text-slate-900">Персонал</div>
                            <div className="mt-1 text-sm text-slate-600">Перевірити кадровий та операційний контур зміни.</div>
                        </button>
                    </div>
                    )}

                    {displayCriticalSKU > 0 && !isSpecificStore && !isPersonnelMode && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shrink-0 shadow-sm">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <div className="text-[10px] uppercase tracking-[0.18em] text-red-700 font-bold">Терміновий сигнал</div>
                                    <h3 className="mt-2 text-2xl font-bold text-red-700">
                                        Критичний дефіцит: {displayCriticalSKU} позицій
                                    </h3>
                                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
                                        Спочатку відбери критичні позиції, потім перевір причину по магазинах і переходь до розподілу.
                                    </p>
                                </div>
                                <button onClick={() => handleStoreClick('Усі')} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-red-50">
                                    Перейти до матриці відбору
                                    <ChevronRight size={16} className="text-red-700" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Content Columns */}
                    <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
                        {/* Main Interaction Area */}
                        <div className="col-span-12 flex flex-col h-full min-h-[400px] bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
                            <ErrorBoundary>
                                {isPersonnelMode ? (
                                    <PersonnelView />
                                ) : isSpecificStore ? (
                                    <StoreSpecificView queue={storeSpecificQueue} storeName={selectedStore} />
                                ) : (
                                    <BIPowerMatrix
                                        deficitQueue={deficitQueue}
                                        allProductsQueue={allProductsQueue}
                                        refreshUrgency="normal"

                                        onMetricsUpdate={setDynamicMetrics}
                                        onManualRefresh={handleRefresh}
                                        planningDays={planningDays}
                                        onPlanningDaysChange={setPlanningDays}
                                    />
                                )}
                            </ErrorBoundary>
                        </div>
                    </div>
                </div>
            </main>

            <style jsx global>{`
                .animate-spin-slow {
                    animation: spin 3s linear infinite;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(0, 0, 0, 0.2);
                }
                .font-display {
                    font-family: 'Rajdhani', sans-serif;
                }
                .font-body {
                    font-family: 'Inter', sans-serif;
                }
            `}</style>
        </div>
    );
};
