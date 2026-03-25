import dynamic from 'next/dynamic';
import { DashboardLayout } from '@/components/layout';

const FoodCostControl = dynamic(
    () => import('@/components/FoodCostControl'),
    { ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-400">Завантаження...</div> }
);

export default function OwnerFoodCostPage() {
    return (
        <DashboardLayout currentWeight={0} maxWeight={1}>
            <FoodCostControl />
        </DashboardLayout>
    );
}
