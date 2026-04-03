'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';

const BIDashboardV2 = dynamic(
    () => import('@/components/sadova/BIDashboardV2').then((m) => m.BIDashboardV2),
    { ssr: false, loading: () => <div className="flex h-64 items-center justify-center text-slate-400">Завантаження дашборду…</div> }
);

export default function SadovaStorePage() {
    const params = useParams();
    const router = useRouter();
    const storeArray = params?.store as string[] | undefined;
    const storeSlug = storeArray?.[0] || 'all';

    React.useEffect(() => {
        if (storeSlug !== 'all') {
            router.replace(`/sadova/stores/${storeSlug}`);
        }
    }, [router, storeSlug]);

    if (storeSlug !== 'all') {
        return <div className="flex h-64 items-center justify-center text-slate-400">Перехід до магазину…</div>;
    }

    return <BIDashboardV2 />;
}
