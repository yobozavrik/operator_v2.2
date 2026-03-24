'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { GravitonProductionPlanner } from '@/components/graviton/GravitonProductionPlanner';

export default function GravitonPlanPage() {
    const router = useRouter();

    return (
        <div className="bg-bg-primary text-text-primary antialiased overflow-hidden h-screen flex flex-col font-sans">
            {/* Header */}
            <header className="bg-panel-bg shadow-[var(--panel-shadow)] border-b border-panel-border p-4 flex items-center shrink-0 z-10 sticky top-0">
                <button
                    onClick={() => router.push('/production/graviton')}
                    className="flex items-center space-x-2 text-text-muted hover:text-text-primary transition-colors bg-bg-primary px-4 py-2 rounded-xl border border-panel-border"
                >
                    <ArrowLeft size={18} />
                    <span className="text-sm font-bold uppercase tracking-wider font-display">На Дашборд</span>
                </button>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-transparent relative z-0">
                <div className="max-w-7xl mx-auto">
                    <GravitonProductionPlanner />
                </div>
            </main>
        </div>
    );
}

