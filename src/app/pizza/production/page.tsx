'use client';

import React from 'react';
import { DashboardLayout } from '@/components/layout';
import { PizzaProductionAnalytics } from '@/components/pizza/PizzaProductionAnalytics';

export default function PizzaProductionPage() {
    return (
        <DashboardLayout>
            <PizzaProductionAnalytics />
        </DashboardLayout>
    );
}
