import { Suspense } from 'react';
import { CraftBreadSales } from '@/components/analytics/CraftBreadSales';

export default function BakerySalesPage() {
    return (
        <Suspense fallback={<div className="p-8 text-slate-500">Завантаження...</div>}>
            <CraftBreadSales />
        </Suspense>
    );
}
