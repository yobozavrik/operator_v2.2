'use client';

import { useRef, useState } from 'react';
import { GravitonDeliveryConfirm } from '@/components/graviton/GravitonDeliveryConfirm';
import {
    GravitonDistributionPanel,
    GravitonDistributionPanelHandle,
    ProductionSnapshotItem,
} from '@/components/graviton/GravitonDistributionPanel';

export default function GravitonDistributionPage() {
    const panelRef = useRef<GravitonDistributionPanelHandle>(null);
    const [actionState, setActionState] = useState({
        isRunDisabled: true,
        isExportDisabled: true,
        isRunLoading: false,
        productionItems: [] as ProductionSnapshotItem[],
        productionTotalKg: 0,
        distributedKg: 0,
        warehouseFreeKg: 0,
        uniqueShops: 0,
    });

    return (
        <div className="flex h-full flex-col gap-4">
            <GravitonDeliveryConfirm
                onRunDistribution={(shopIds) => panelRef.current?.runDistribution(shopIds)}
                onExportExcel={(ids) => panelRef.current?.exportExcel(ids)}
                runDisabled={actionState.isRunDisabled}
                exportDisabled={actionState.isExportDisabled}
                runLoading={actionState.isRunLoading}
                productionItems={actionState.productionItems}
                productionTotalKg={actionState.productionTotalKg}
                distributedKg={actionState.distributedKg}
                warehouseFreeKg={actionState.warehouseFreeKg}
                uniqueShops={actionState.uniqueShops}
            />
            <GravitonDistributionPanel
                ref={panelRef}
                onActionStateChange={setActionState}
            />
        </div>
    );
}
