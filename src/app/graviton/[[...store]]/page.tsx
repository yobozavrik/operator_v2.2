'use client';

import { BIDashboard } from '@/components/graviton/BIDashboard';
import { useParams } from 'next/navigation';
import { useStore } from '@/context/StoreContext';
import React from 'react';

const SLUG_TO_LABEL: Record<string, string> = {
    'all': 'Усі',
    'sadgora': 'Магазин "Садгора"',
    'sadova': 'Магазин "Садгора"',
    'kompas': 'Магазин "Компас"',
    'ruska': 'Магазин "Руська"',
    'hotynska': 'Магазин "Хотинська"',
    'biloruska': 'Магазин "Білоруська"',
    'kvarc': 'Магазин "Кварц"',
};

export default function GravitonStorePage() {
    const params = useParams();
    const { setSelectedStore } = useStore();
    const storeArray = params?.store as string[] | undefined;
    const storeSlug = storeArray?.[0] || 'all';

    React.useEffect(() => {
        const label = SLUG_TO_LABEL[storeSlug];
        if (label) {
            setSelectedStore(label);
        }
    }, [storeSlug, setSelectedStore]);

    return <BIDashboard />;
}
