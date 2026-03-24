'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Store,
    ShoppingCart,
    FileSpreadsheet,
    ChevronLeft,
    Menu,
    LogOut,
    PieChart,
    Calendar,
    TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
// Note: We'll implement global date context later, currently just layout.

export default function BakeryAdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname();
    const [isSidebarOpen, setSidebarOpen] = useState(true);

    const navItems = [
        { href: '/bakery-admin', label: 'Overview', icon: <LayoutDashboard size={20} /> },
        { href: '/bakery-admin/stores', label: 'Stores Analytics', icon: <Store size={20} /> },
        { href: '/bakery-admin/catalog', label: 'SKU Catalog', icon: <ShoppingCart size={20} /> },
        { href: '/bakery-admin/reports', label: 'Reports & Export', icon: <FileSpreadsheet size={20} /> },
        { href: '/bakery-admin/forecasts', label: 'РџСЂРѕРіРЅРѕР·СѓРІР°РЅРЅСЏ С– Р—Р°РєР°Р·', icon: <TrendingUp size={20} /> },
    ];

    return (
        <div className="flex h-screen bg-[#F4F6F9] font-sans text-[#333] overflow-hidden">
            {/* Sidebar (AdminLTE Dark Style) */}
            <aside className={cn(
                "bg-[#343A40] text-white flex flex-col transition-all duration-300 ease-in-out shrink-0 relative overflow-y-auto elevation-4 z-20 shadow-xl",
                isSidebarOpen ? "w-[250px]" : "w-[70px] hidden md:flex"
            )}>
                {/* Brand Logo */}
                <div className="h-[57px] flex items-center justify-center shrink-0 border-b border-white/10 bg-[#343A40]">
                    <PieChart size={28} className={cn("text-white", isSidebarOpen ? "mr-2" : "m-0")} />
                    {isSidebarOpen && <span className="font-bold text-lg tracking-wide">CRAFT BAKERY</span>}
                </div>

                {/* Navigation Menu */}
                <nav className="flex-1 px-2 py-4 space-y-1">
                    <div className={cn("text-xs font-bold text-gray-400 uppercase mb-2 mt-4 px-3", !isSidebarOpen && "text-center px-0")}>
                        {isSidebarOpen ? 'РђРЅР°Р»РёС‚РёРєР°' : '...'}
                    </div>
                    {navItems.map((item) => {
                        const isActive = item.href === '/bakery-admin'
                            ? pathname === item.href
                            : pathname?.startsWith(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                prefetch={false}
                                className={cn(
                                    "flex items-center rounded-md px-3 py-2.5 transition-colors group",
                                    isActive
                                        ? "bg-blue-600 text-white shadow-sm"
                                        : "text-gray-300 hover:bg-white/10 hover:text-white"
                                )}
                            >
                                <span className={cn("shrink-0", !isSidebarOpen && "mx-auto")}>{item.icon}</span>
                                {isSidebarOpen && <span className="ml-3 font-medium text-[15px]">{item.label}</span>}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-white/10 shrink-0">
                    <Link href="/" prefetch={false} className={cn(
                        "flex items-center text-gray-400 hover:text-white transition-colors",
                        !isSidebarOpen && "justify-center"
                    )}>
                        <ChevronLeft size={20} className="shrink-0" />
                        {isSidebarOpen && <span className="ml-3 text-sm font-medium">Command Center</span>}
                    </Link>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#F4F6F9]">
                {/* Top Navbar */}
                <header className="h-[57px] bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 shadow-sm z-10 w-full relative">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setSidebarOpen(!isSidebarOpen)}
                            className="text-gray-500 hover:text-gray-700 p-1 rounded-md transition-colors"
                        >
                            <Menu size={24} />
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Placeholder for Date Picker, to be implemented as a global context/component */}
                        <div className="hidden md:flex items-center bg-gray-100 rounded-md px-3 py-1.5 text-sm text-gray-600 border border-gray-200 cursor-not-allowed">
                            <Calendar size={16} className="mr-2 text-gray-400" />
                            Р“Р»РѕР±Р°Р»СЊРЅС‹Р№ РїРµСЂРёРѕРґ: РџСЂРµРґ. 14 РґРЅРµР№
                        </div>

                        <Link href="/login" prefetch={false} className="text-gray-500 hover:text-gray-700 p-1.5 rounded-md transition-colors tooltip" title="Р’С‹Р№С‚Рё">
                            <LogOut size={20} />
                        </Link>
                    </div>
                </header>

                {/* Page Content Viewport */}
                <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 pb-20">
                    <div className="max-w-[1600px] mx-auto w-full">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}

