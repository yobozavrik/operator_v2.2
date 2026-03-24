'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { BrainCircuit, ArrowLeft, TrendingUp, AlertTriangle, Layers, Store, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui';
import { GRAVITON_SHOPS } from '@/lib/transformers';
import { authedFetcher } from '@/lib/authed-fetcher';

const fetcher = authedFetcher;

export default function ForecastingDashboard() {
    const router = useRouter();
    const toast = useToast();
    const [formattedDate, setFormattedDate] = useState<string>('');
    const [targetDate, setTargetDate] = useState<string | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    // Modal States: Category -> Store -> Products
    const [selectedCategory, setSelectedCategory] = useState<any>(null);
    const [selectedStore, setSelectedStore] = useState<any>(null);

    useEffect(() => {
        setFormattedDate(new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()));

        // Default to tomorrow's date for predictions in LOCAL time
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tzOffset = tomorrow.getTimezoneOffset() * 60000;
        const localISOTime = new Date(tomorrow.getTime() - tzOffset).toISOString().split('T')[0];

        setTargetDate(localISOTime);
        setIsMounted(true);
    }, []);

    // Fetch predictions from the API
    const { data: predictions, error: predError, isLoading: isPredLoading } = useSWR(
        isMounted && targetDate ? `/api/forecasting/predictions?date=${targetDate}` : null,
        fetcher
    );

    // Fetch all products to map SKU IDs to Names and Categories
    const { data: allProducts, error: prodError, isLoading: isProdLoading } = useSWR(
        isMounted ? '/api/forecasting/all-products' : null,
        fetcher
    );

    const isLoading = isPredLoading || isProdLoading;
    const error = predError || prodError;

    // Process data into Category -> Store -> Product hierarchy
    const hierarchy = useMemo(() => {
        if (!predictions || !Array.isArray(predictions) || !allProducts || !Array.isArray(allProducts)) {
            return [];
        }

        const productMap = new Map();
        const categoriesMap = new Map<string, any>();

        allProducts.forEach((p: any) => {
            const catName = p.category_name || 'Other';
            const skuId = p.sku_id;
            const productName = String(p.product_name || '');
            const isPiece = productName.toLowerCase().includes('шт') ||
                productName.toLowerCase().includes('штук') ||
                ['Піца', 'Крафтовий хліб', 'ПИРІЖЕЧКИ', 'Кондитерка', 'Напої', 'ПІЦА 30см', 'Морозиво'].includes(catName);

            productMap.set(skuId, {
                name: productName,
                category: catName,
                isPiece
            });

            if (!categoriesMap.has(catName)) {
                categoriesMap.set(catName, {
                    categoryName: catName,
                    totalKg: 0,
                    storesMap: new Map<number, any>()
                });
            }
        });

        predictions.forEach((p: any) => {
            const prodInfo = productMap.get(p.sku_id) || { name: `РўРѕРІР°СЂ ID ${p.sku_id}`, category: 'Р†РЅС€Рµ', isPiece: false };
            const catName = prodInfo.category;
            const storeId = p.store_id;
            const shop = GRAVITON_SHOPS.find(s => s.id === storeId);
            const storeName = shop ? `РњР°РіР°Р·РёРЅ "${shop.name}"` : `РњР°РіР°Р·РёРЅ ID ${storeId}`;
            const val = Number(p.recommended_kg) || 0;

            if (!categoriesMap.has(catName)) {
                categoriesMap.set(catName, {
                    categoryName: catName,
                    totalKg: 0,
                    totalPcs: 0,
                    storesMap: new Map<number, any>()
                });
            }

            const catData = categoriesMap.get(catName);
            if (!prodInfo.isPiece) {
                catData.totalKg += val;
            } else {
                catData.totalPcs += val;
            }

            if (!catData.storesMap.has(storeId)) {
                catData.storesMap.set(storeId, {
                    storeId,
                    storeName,
                    totalKg: 0,
                    totalPcs: 0,
                    products: []
                });
            }

            const storeData = catData.storesMap.get(storeId);
            if (!prodInfo.isPiece) {
                storeData.totalKg += val;
            } else {
                storeData.totalPcs += val;
            }

            storeData.products.push({
                skuId: p.sku_id,
                productName: prodInfo.name,
                val: val,
                isPiece: prodInfo.isPiece
            });
        });

        const finalArray = Array.from(categoriesMap.values()).map((cat: any) => {
            return {
                ...cat,
                totalKg: Number((cat.totalKg / 1000).toFixed(2)),
                totalPcs: Math.round(cat.totalPcs),
                stores: Array.from(cat.storesMap.values()).map((store: any) => ({
                    ...store,
                    totalKg: Number((store.totalKg / 1000).toFixed(2)),
                    totalPcs: Math.round(store.totalPcs),
                    products: store.products.sort((a: any, b: any) => b.val - a.val)
                })).sort((a: any, b: any) => (b.totalKg + b.totalPcs) - (a.totalKg + a.totalPcs))
            };
        }).sort((a: any, b: any) => {
            if (a.stores.length > 0 && b.stores.length === 0) return -1;
            if (b.stores.length > 0 && a.stores.length === 0) return 1;
            const bTotal = b.totalKg + b.totalPcs;
            const aTotal = a.totalKg + a.totalPcs;
            if (bTotal !== aTotal) return bTotal - aTotal;
            return a.categoryName.localeCompare(b.categoryName);
        });

        return finalArray;
    }, [predictions, allProducts]);

    const totalPredictedKg = hierarchy.reduce((sum, cat) => sum + cat.totalKg, 0);

    if (!isMounted) {
        return (
            <div className="bg-bg-primary min-h-screen flex items-center justify-center"></div>
        );
    }

    return (
        <div className="bg-bg-primary text-text-primary antialiased min-h-screen font-sans pb-12">
            <div className="flex flex-col p-6 space-y-6 max-w-7xl mx-auto">
                {/* Dashboard Header */}
                <div className="bg-panel-bg shadow-[var(--panel-shadow)] border border-panel-border p-6 flex justify-between items-center shrink-0 rounded-2xl">
                    <div className="flex items-center space-x-6">
                        <button onClick={() => router.back()} className="text-text-muted hover:text-text-primary transition-colors">
                            <ArrowLeft size={24} />
                        </button>
                        <div className="h-8 w-[1px] bg-panel-border"></div>
                        <div className="flex items-center space-x-4">
                            <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20">
                                <BrainCircuit className="text-purple-400" size={24} />
                            </div>
                            <div>
                                <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-wider font-display">Р“РђР›РЇ Р‘РђР›РЈР’РђРќРђ</h1>
                                <p className="text-xs text-text-secondary uppercase tracking-widest font-display">РџР РћР“РќРћР—РЈР’РђРќРќРЇ Р’РР РћР‘РќРР¦РўР’Рђ (ML)</p>
                            </div>
                        </div>
                    </div>
                    <div className="text-right hidden md:block">
                        <div className="text-xs text-text-muted font-medium mb-1 font-display">{formattedDate}</div>
                        <div className="text-3xl font-bold text-purple-400 font-display tabular-nums">
                            ML РџР›РђРќРЈР’РђРќРќРЇ
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-panel-bg shadow-[var(--panel-shadow)] border border-panel-border rounded-2xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-bl-full"></div>
                        <div className="flex items-start justify-between mb-4 relative z-10">
                            <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20 text-purple-400">
                                <TrendingUp size={24} />
                            </div>
                        </div>
                        <div className="text-[10px] text-text-secondary uppercase font-bold tracking-widest font-display mb-1">РџСЂРѕРіРЅРѕР· Р—Р°РіР°Р»СЊРЅРѕРіРѕ Р’РёСЂРѕР±РЅРёС†С‚РІР°</div>
                        <div className="text-3xl font-bold text-text-primary font-display">
                            {isLoading ? "..." : `${totalPredictedKg.toFixed(2)} РєРі`}
                        </div>
                        <div className="text-sm text-green-500 mt-2 flex items-center gap-1">РќР° {targetDate}</div>
                    </div>

                    <div className="bg-panel-bg shadow-[var(--panel-shadow)] border border-panel-border rounded-2xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-green-500/10 to-transparent rounded-bl-full"></div>
                        <div className="flex items-start justify-between mb-4 relative z-10">
                            <div className="p-3 bg-green-500/10 rounded-xl border border-green-500/20 text-green-500">
                                <AlertTriangle size={24} />
                            </div>
                        </div>
                        <div className="text-[10px] text-text-secondary uppercase font-bold tracking-widest font-display mb-1">Р—РЅРёР¶РµРЅРЅСЏ СЃРїРёСЃР°РЅСЊ</div>
                        <div className="text-3xl font-bold text-text-primary font-display">-18%</div>
                        <div className="text-sm text-text-muted mt-2">Р•РєРѕРЅРѕРјС–СЏ: ~15,000 РіСЂРЅ/РјС–СЃ</div>
                    </div>

                    <button className="bg-panel-bg shadow-[var(--panel-shadow)] hover:bg-bg-primary border border-panel-border border-l-4 border-l-purple-500 rounded-2xl p-6 relative overflow-hidden group transition-all text-left block w-full outline-none focus:ring-2 ring-purple-500/50">
                        <div className="text-[10px] text-purple-400 uppercase font-bold tracking-widest font-display mb-2">Р”С–СЏ</div>
                        <div className="text-xl font-bold text-text-primary font-display mb-2 group-hover:text-purple-400 transition-colors">РџРµСЂРµРіРµРЅРµСЂР°С†С–СЏ</div>
                        <div className="text-xs text-text-secondary font-sans group-hover:text-text-primary transition-colors">Р—Р°РїСѓСЃС‚РёС‚Рё Python СЃРєСЂРёРїС‚ РґР»СЏ РїРѕРІС‚РѕСЂРЅРѕРіРѕ РЅР°РІС‡Р°РЅРЅСЏ РјРѕРґРµР»С– РЅР° РѕСЃС‚Р°РЅРЅС–С… РґР°РЅРёС….</div>
                    </button>
                </div>

                {/* Main View: Categories */}
                {isLoading ? (
                    <div className="text-center p-12 text-text-muted">Р—Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ РїСЂРѕРіРЅРѕР·С–РІ С‚Р° С–РЅС„РѕСЂРјР°С†С–С— РїСЂРѕ С‚РѕРІР°СЂРё...</div>
                ) : error ? (
                    <div className="text-center p-12 text-status-critical">РџРѕРјРёР»РєР° Р·Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ РґР°РЅРёС…</div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {hierarchy.map((cat: any) => (
                            <div
                                key={cat.categoryName}
                                onClick={() => setSelectedCategory(cat)}
                                className={cn(
                                    "bg-panel-bg shadow-[var(--panel-shadow)] border rounded-2xl p-5 cursor-pointer hover:-translate-y-1 hover:shadow-lg transition-all group flex flex-col justify-between overflow-hidden relative",
                                    cat.stores.length === 0 ? "border-panel-border/30 opacity-60 flex-1" : "border-panel-border hover:border-purple-500/50"
                                )}
                            >
                                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-purple-500/5 to-transparent rounded-bl-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                <div className="mb-6 relative z-10">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-bg-primary rounded-lg border border-panel-border group-hover:border-purple-500/30 transition-colors">
                                            <Layers className="text-text-secondary group-hover:text-purple-400 transition-colors" size={20} />
                                        </div>
                                        <h2 className="text-lg font-bold font-display uppercase tracking-wider text-text-primary line-clamp-2">
                                            {cat.categoryName}
                                        </h2>
                                    </div>
                                </div>
                                <div className="relative z-10">
                                    <div className="flex justify-between items-center text-xs text-text-muted mb-3">
                                        <span className="flex items-center gap-1.5"><Store size={14} /> РњР°РіР°Р·РёРЅС–РІ Сѓ РїР»Р°РЅС–:</span>
                                        <span className="font-bold text-text-primary">{cat.stores.length}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-bg-primary/50 py-2 px-3 rounded-lg -mx-3">
                                        <span className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">РЎРїС–Р»СЊРЅРёР№ РїР»Р°РЅ</span>
                                        {cat.stores.length > 0 ? (
                                            <div className="text-base font-bold text-purple-400 font-display tabular-nums">
                                                {cat.totalPcs > 0 && cat.totalKg === 0 ? (
                                                    <>{cat.totalPcs} <span className="text-[10px] text-purple-400/70">С€С‚</span></>
                                                ) : (
                                                    <>{cat.totalKg} <span className="text-[10px] text-purple-400/70">РєРі</span></>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-[10px] font-bold text-text-muted font-display uppercase tracking-widest bg-panel-border/20 px-2 py-1 rounded-md">
                                                РќРµРјР°С” РІРёРїСѓСЃРєСѓ
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal Layer 1: Selected Category -> Stores Grid */}
            {selectedCategory && !selectedStore && (
                <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-bg-primary/80 backdrop-blur-sm">
                    <div className="bg-panel-bg border border-panel-border rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 duration-200">
                        {/* Header */}
                        <div className="p-6 border-b border-panel-border bg-bg-primary/50 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-xl font-bold font-display text-text-primary uppercase tracking-wider flex items-center gap-3">
                                    <Layers className="text-purple-400" size={24} />
                                    {selectedCategory.categoryName}
                                </h3>
                                <p className="text-xs text-text-muted mt-2 uppercase tracking-widest font-bold">РўРѕС‡РєРё РїСЂРѕРґР°Р¶Сѓ Р· РїСЂРѕРіРЅРѕР·РѕРј</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 rounded-lg flex flex-col items-end">
                                    <span className="text-[10px] text-purple-400/70 uppercase tracking-widest font-bold">
                                        {selectedCategory.totalPcs > 0 && selectedCategory.totalKg === 0 ? 'Р—Р°РіР°Р»СЊРЅР° РєС–Р»СЊРєС–СЃС‚СЊ' : 'Р—Р°РіР°Р»СЊРЅР° РІР°РіР°'}
                                    </span>
                                    <span className="text-lg font-bold text-purple-400 font-display">
                                        {selectedCategory.totalPcs > 0 && selectedCategory.totalKg === 0 ? (
                                            <>{selectedCategory.totalPcs} <span className="text-xs text-purple-400/70">С€С‚</span></>
                                        ) : (
                                            <>{selectedCategory.totalKg} <span className="text-xs text-purple-400/70">РєРі</span></>
                                        )}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setSelectedCategory(null)}
                                    className="p-2 hover:bg-panel-border rounded-xl text-text-muted hover:text-text-primary transition-colors"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        {/* Body: Stores Grid */}
                        <div className="overflow-y-auto p-6 custom-scrollbar flex-1 bg-bg-primary/20">
                            {selectedCategory.stores.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
                                    {selectedCategory.stores.map((store: any) => (
                                        <div
                                            key={store.storeId}
                                            onClick={() => setSelectedStore({ category: selectedCategory.categoryName, ...store })}
                                            className="bg-panel-bg shadow-sm border border-panel-border rounded-2xl p-5 cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group flex flex-col relative overflow-hidden"
                                        >
                                            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-bl-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                            <div className="flex items-start justify-between mb-4 relative z-10 gap-2">
                                                <Store className="text-text-secondary group-hover:text-purple-400 transition-colors shrink-0" size={20} />
                                                <h3 className="text-sm font-bold font-display text-text-primary tracking-wide leading-tight line-clamp-2 text-right">
                                                    {store.storeName}
                                                </h3>
                                            </div>

                                            <div className="mt-auto relative z-10 flex flex-col pt-3 border-t border-panel-border/50">
                                                <div className="flex justify-between items-center text-xs text-text-muted mb-2">
                                                    <span>РџСЂРѕРґСѓРєС‚С–РІ:</span>
                                                    <span className="font-bold text-text-primary">{store.products.length}</span>
                                                </div>
                                                <div className="flex justify-between items-center bg-bg-primary py-2 px-3 rounded-xl border border-panel-border group-hover:border-purple-500/30 transition-colors">
                                                    <span className="text-[10px] uppercase tracking-widest font-bold text-text-secondary">РџР»Р°РЅ</span>
                                                    <span className="text-sm font-bold tabular-nums text-purple-400">
                                                        {store.totalPcs > 0 && store.totalKg === 0 ? (
                                                            <>{store.totalPcs} <span className="text-[10px] text-purple-400/70">С€С‚</span></>
                                                        ) : (
                                                            <>{store.totalKg} <span className="text-[10px] text-purple-400/70">РєРі</span></>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-text-muted py-16">
                                    <div className="p-4 bg-bg-primary rounded-full mb-4 border border-panel-border shadow-sm">
                                        <AlertTriangle size={32} className="text-text-secondary" />
                                    </div>
                                    <h4 className="text-lg font-bold text-text-primary mb-1">РџСЂРѕРіРЅРѕР·Рё РЅР° С†С–Р№ РєР°С‚РµРіРѕСЂС–С— РІС–РґСЃСѓС‚РЅС–</h4>
                                    <p className="text-sm max-w-sm text-center">РђР»РіРѕСЂРёС‚Рј РЅРµ Р·РЅР°Р№С€РѕРІ С–СЃС‚РѕСЂС–С— РїСЂРѕРґР°Р¶С–РІ Р°Р±Рѕ РЅРµ РїРµСЂРµРґР±Р°С‡Р°С” РїРѕРїРёС‚ РЅР° Р·Р°РІС‚СЂР°С€РЅС–Р№ РґРµРЅСЊ.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Layer 2: Selected Store -> Products List */}
            {selectedStore && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-primary/90 backdrop-blur-md">
                    <div className="bg-panel-bg border border-panel-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4 duration-200">
                        {/* Header */}
                        <div className="p-6 border-b border-panel-border bg-bg-primary/50 flex justify-between items-center shrink-0">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <p className="text-[10px] text-purple-400 font-display uppercase tracking-widest bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded flex items-center gap-1.5">
                                        <Layers size={10} /> {selectedStore.category}
                                    </p>
                                </div>
                                <h3 className="text-xl font-bold font-display text-text-primary tracking-wide flex items-center gap-2 mt-1">
                                    <Store className="text-text-secondary" size={20} />
                                    {selectedStore.storeName}
                                </h3>
                                <p className="text-xs text-text-muted mt-2 uppercase tracking-widest font-bold">Р”РµС‚Р°Р»С–Р·РѕРІР°РЅРёР№ РїР»Р°РЅ РІРёСЂРѕР±РЅРёС†С‚РІР°</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-2xl font-bold text-purple-400 tabular-nums">
                                    {selectedStore.totalPcs > 0 && selectedStore.totalKg === 0 ? (
                                        <>{selectedStore.totalPcs} <span className="text-sm text-purple-400/70">С€С‚</span></>
                                    ) : (
                                        <>{selectedStore.totalKg} <span className="text-sm text-purple-400/70">РєРі</span></>
                                    )}
                                </div>
                                <div className="w-[1px] h-8 bg-panel-border mx-2"></div>
                                <button
                                    onClick={() => setSelectedStore(null)}
                                    className="p-2 hover:bg-panel-border/50 rounded-xl text-text-muted hover:text-text-primary transition-colors flex items-center justify-center border border-transparent hover:border-panel-border"
                                >
                                    <ArrowLeft size={24} />
                                </button>
                            </div>
                        </div>

                        {/* Body: Products Table */}
                        <div className="overflow-y-auto p-0 custom-scrollbar flex-1 bg-panel-bg">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-panel-bg shadow-sm z-10">
                                    <tr className="border-b-2 border-panel-border text-[10px] text-text-secondary font-display uppercase tracking-widest bg-bg-primary/80 backdrop-blur-md">
                                        <th className="p-5 pl-8 font-medium border-r border-panel-border/50">РўРѕРІР°СЂРЅР° РїРѕР·РёС†С–СЏ</th>
                                        <th className="p-5 pr-8 font-medium text-right w-32">РђР»РіРѕСЂРёС‚Рј</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedStore.products.map((prod: any, idx: number) => {
                                        // Formatting the display
                                        let displayVal = `${prod.val}`;
                                        let unit = '';
                                        if (prod.isPiece) {
                                            displayVal = `${Math.round(prod.val)}`;
                                            unit = 'С€С‚';
                                        } else {
                                            if (prod.val >= 1000) {
                                                displayVal = `${(prod.val / 1000).toFixed(2)}`;
                                                unit = 'РєРі';
                                            } else {
                                                displayVal = `${Math.round(prod.val)}`;
                                                unit = 'Рі';
                                            }
                                        }

                                        return (
                                            <tr key={prod.skuId} className={cn(
                                                "border-b border-panel-border/30 hover:bg-bg-primary/80 transition-colors group",
                                                idx % 2 === 0 ? "bg-transparent" : "bg-bg-primary/20"
                                            )}>
                                                <td className="p-4 pl-8 text-sm text-text-primary font-medium group-hover:text-purple-400 transition-colors border-r border-panel-border/50">
                                                    {prod.productName}
                                                    <div className="text-[10px] text-text-muted mt-1 uppercase tracking-widest">РђСЂС‚: {prod.skuId}</div>
                                                </td>
                                                <td className="p-4 pr-8 text-right">
                                                    <span className="text-base font-bold tabular-nums text-purple-400">
                                                        {prod.isPiece ? (
                                                            <>{prod.val} <span className="text-[10px] text-purple-400/70">С€С‚</span></>
                                                        ) : (
                                                            <>{prod.val} <span className="text-[10px] text-purple-400/70">РєРі</span></>
                                                        )}
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
