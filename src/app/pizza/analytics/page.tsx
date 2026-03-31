'use client';

import React from 'react';
import { DashboardLayout } from '@/components/layout';
import { PizzaSalesAnalytics } from '@/components/pizza/PizzaSalesAnalytics';

export default function PizzaAnalyticsPage() {
    return (
        <DashboardLayout>
            <PizzaSalesAnalytics />
        </DashboardLayout>
    );
}
