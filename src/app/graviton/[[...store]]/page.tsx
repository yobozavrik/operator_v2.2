'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useStore } from '@/context/StoreContext';
import React from 'react';

const BIDashboard = dynamic(
    () => import('@/components/graviton/BIDashboard').then((m) => m.BIDashboard),
    { ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-400">Завантаження дашборду...</div> }
);

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
