'use client';

import { useRef, useState } from 'react';
import { SadovaDeliveryConfirm } from '@/components/sadova/SadovaDeliveryConfirm';
import {
    SadovaDistributionPanel,
    SadovaDistributionPanelHandle,
    ProductionSnapshotItem,
} from '@/components/sadova/SadovaDistributionPanel';

export default function SadovaDistributionPage() {
    const panelRef = useRef<SadovaDistributionPanelHandle>(null);
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
            <SadovaDeliveryConfirm
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
            <SadovaDistributionPanel
                ref={panelRef}
                onActionStateChange={setActionState}
            />
        </div>
    );
}
