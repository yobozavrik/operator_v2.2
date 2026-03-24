import { DashboardLayout } from '@/components/layout';
import FoodCostControl from '@/components/FoodCostControl';

export default function OwnerFoodCostPage() {
    return (
        <DashboardLayout currentWeight={0} maxWeight={1}>
            <FoodCostControl />
        </DashboardLayout>
    );
}
