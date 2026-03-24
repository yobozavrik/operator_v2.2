'use client';

import React, { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ArrowLeft, MapPin, AlertCircle } from 'lucide-react';
import useSWR from 'swr';
import { transformDeficitData } from '@/lib/transformers';
import { ProductionTask } from '@/types/bi';
import { StoreSpecificView } from '@/components/StoreSpecificView';

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then(r => r.json());

const SLUG_TO_LABEL: Record<string, string> = {
    'all': 'Усі',
    'sadgora': 'Магазин "Садгора"',
    'kompas': 'Магазин "Компас"',
    'ruska': 'Магазин "Руська"',
    'hotynska': 'Магазин "Хотинська"',
    'biloruska': 'Магазин "Білоруська"',
    'kvarc': 'Магазин "Кварц"',
};

export default function StoreDynamicPage() {
    const params = useParams();
    const router = useRouter();
    const slug = params?.slug as string;

    // Convert slug to actual store label
    const storeLabel = SLUG_TO_LABEL[slug] || `Магазин "${slug}"`;

    // Fetch the raw deficit data
    const { data: deficitData, error: deficitError } = useSWR(
        '/api/graviton/deficit',
        fetcher,
        { refreshInterval: 60000 }
    );

    // Transform full raw data to ProductionTask queue
    const deficitQueue = useMemo((): ProductionTask[] => {
        if (!deficitData || !Array.isArray(deficitData)) return [];
        return transformDeficitData(deficitData);
    }, [deficitData]);

    // Only pass valid items if data exists
    const storeSpecificQueue = useMemo(() => {
        if (!deficitQueue.length) return [];
        return deficitQueue
            .map(task => {
                const storeData = task.stores.find(s => s.storeName === storeLabel);
                // Keep only products with deficit/recommended load
                if (!storeData || (!storeData.deficitKg && !storeData.recommendedKg)) return null;
                return {
                    ...task,
                    stores: [storeData], // Restrict store array to only this store
                    // Force the overall item "recommended" quantity to match this store's deficit
                    recommendedQtyKg: storeData.deficitKg > 0 ? storeData.deficitKg : storeData.recommendedKg,
                } as ProductionTask;
            })
            .filter((item): item is ProductionTask => item !== null);
    }, [deficitQueue, storeLabel]);

    // Handle offline / error states as a subtle banner instead of blocking the screen
    const isError = !!deficitError;
    const isLoading = !deficitData && !isError;

    return (
        <div className="h-screen bg-bg-primary text-text-primary font-sans flex flex-col overflow-hidden selection:bg-[#00E0FF]/30">
            {/* HEADER */}
            <div className="shrink-0 px-6 py-4 border-b border-panel-border bg-panel-bg flex items-center justify-between z-20 shadow-[var(--panel-shadow)]">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push('/production/graviton')}
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-[#00E0FF]/10 text-white hover:text-[#00E0FF] transition-all border border-white/10 hover:border-[#00E0FF]/30 hover:shadow-[0_0_15px_rgba(0,224,255,0.2)]"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-[#00E0FF] uppercase tracking-widest font-display font-bold mb-0.5">ВЕРНУТИСЬ</span>
                        <h1 className="text-lg font-bold font-display tracking-tight text-white uppercase leading-none">
                            Головний Дашборд
                        </h1>
                    </div>
                </div>
                {isLoading && (
                    <div className="flex items-center gap-2 text-[#00E0FF] font-display tracking-widest text-xs animate-pulse">
                        <div className="w-4 h-4 border-2 border-[#00E0FF] border-t-transparent rounded-full animate-spin"></div>
                        СИНХРОНІЗАЦІЯ...
                    </div>
                )}
                {isError && (
                    <div className="flex items-center gap-2 text-[#E74856] font-display tracking-widest text-xs">
                        <AlertCircle size={16} />
                        ПОМИЛКА ЗВ'ЯЗКУ
                    </div>
                )}
            </div>

            {/* MAIN CONTENT AREA - Spans full height/width */}
            <main className="flex-1 relative z-10 w-full overflow-hidden bg-[#0A1931]">
                <StoreSpecificView queue={storeSpecificQueue} storeName={storeLabel} />
            </main>
        </div>
    );
}
