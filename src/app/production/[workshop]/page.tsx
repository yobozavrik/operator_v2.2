'use client';

import React from 'react';
import { notFound, useParams } from 'next/navigation';
import { BIDashboard } from '@/components/graviton/BIDashboard'; // Graviton Dashboard
import { useStore } from '@/context/StoreContext';
// Import other dashboards here if needed (e.g. Pizza)

export default function WorkshopProductionPage() {
    const params = useParams();
    const workshop = params.workshop as string;
    const { setSelectedStore } = useStore();

    // Map URL slug to workshop context if needed
    // For now, if workshop === 'graviton', render BIDashboard

    // Safety check for valid workshops
    const validWorkshops = ['graviton', 'pizza', 'bakery', 'florida', 'sadova', 'entuziastiv', 'bulvar', 'confectionery', 'heroiv'];

    if (!validWorkshops.includes(workshop)) {
        notFound();
    }

    if (workshop === 'graviton') {
        // Ensure "All" is selected by default when entering the generic workshop view
        React.useEffect(() => {
            setSelectedStore('Усі');
        }, [setSelectedStore]);

        return <BIDashboard />;
    }

    if (workshop === 'pizza') {
        // Placeholder for Pizza dashboard redirect or component
        return (
            <div className="flex items-center justify-center h-screen bg-[#0B0F19] text-white">
                <h1 className="text-2xl font-bold uppercase tracking-widest text-[#FFB800]">Pizza Production <span className="opacity-50 text-sm block mt-2 text-center">In Development</span></h1>
            </div>
        );
    }

    // Generic fallback for others
    return (
        <div className="flex items-center justify-center h-screen bg-[#0B0F19] text-white/50">
            <h1 className="text-xl font-bold uppercase tracking-widest">Workshop: {workshop} (Under Construction)</h1>
        </div>
    );
}
