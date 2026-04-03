'use client';

import React, { useMemo } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { transformDeficitData } from '@/lib/transformers';
import { ProductionTask } from '@/types/bi';
import { StoreSpecificView } from '@/components/StoreSpecificView';
import { authedFetcher } from '@/lib/authed-fetcher';

const fetcher = authedFetcher;

const SLUG_TO_LABEL: Record<string, string> = {
    'sadova': 'Магазин "Гравітон"',
    'sadgora': 'Магазин "Садгора"',
    'kompas': 'Магазин "Компас"',
    'ruska': 'Магазин "Руська"',
    'hotynska': 'Магазин "Хотинська"',
    'biloruska': 'Магазин "Білоруська"',
    'kvarc': 'Магазин "Кварц"',
};

export default function StoreDynamicPage() {
    const params = useParams();
    const slug = params?.slug as string;
    const storeLabel = SLUG_TO_LABEL[slug] || `Магазин "${slug}"`;

    const { data: deficitData } = useSWR('/api/sadova/deficit', fetcher, { refreshInterval: 60000 });

    const deficitQueue = useMemo((): ProductionTask[] => {
        if (!deficitData || !Array.isArray(deficitData)) return [];
        return transformDeficitData(deficitData);
    }, [deficitData]);

    const storeSpecificQueue = useMemo(() => {
        return deficitQueue
            .map((task) => {
                const storeData = task.stores.find((store) => store.storeName === storeLabel);
                if (!storeData || (!storeData.deficitKg && !storeData.recommendedKg)) return null;
                return {
                    ...task,
                    stores: [storeData],
                    recommendedQtyKg: storeData.deficitKg > 0 ? storeData.deficitKg : storeData.recommendedKg,
                } as ProductionTask;
            })
            .filter((item): item is ProductionTask => item !== null);
    }, [deficitQueue, storeLabel]);

    return <StoreSpecificView queue={storeSpecificQueue} storeName={storeLabel} />;
}
