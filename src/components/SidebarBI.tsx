'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Factory,
    LayoutGrid,
    Layers,
    Activity,
    Users,
    Settings
} from 'lucide-react';

export const SidebarBI = () => {
    const pathname = usePathname();

    const navItems = [
        { icon: LayoutGrid, label: 'Dashboard', href: '/' },
        { icon: Layers, label: 'Inventory Matrix', href: '/pizza' },
        { icon: Activity, label: 'Analytics', href: '/analytics' },
        { icon: Users, label: 'Personnel', href: '/personnel' },
        { icon: Settings, label: 'Settings', href: '/settings' },
    ];

    return (
        <aside className="w-72 premium-sidebar flex flex-col shrink-0 relative z-20 h-screen sticky top-0">
            <div className="p-8 flex items-center gap-4">
                <div className="w-10 h-10 bg-[#00E0FF]/20 flex items-center justify-center rounded-xl border border-[#00E0FF]/30 shadow-[0_0_15px_rgba(0,224,255,0.15)]">
                    <Factory className="text-[#00E0FF]" size={20} />
                </div>
                <div>
                    <span className="font-bold text-xl tracking-wider text-white block uppercase font-[family-name:var(--font-chakra)]">PIZZA_OS</span>
                    <span className="text-[10px] text-[#00E0FF]/80 uppercase tracking-[0.2em] font-[family-name:var(--font-jetbrains)] block mt-0.5">COMMAND CENTER</span>
                </div>
            </div>

            <nav className="flex-1 px-4 py-4 space-y-2">
                {navItems.map((item) => {
                    // Just a basic active check based on href
                    const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));

                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={`flex items-center gap-4 px-5 py-4 rounded-xl transition-all group border border-transparent ${isActive
                                ? 'nav-item-active'
                                : 'text-slate-400 hover:text-white hover:bg-white/5 hover:border-white/10'
                                }`}
                        >
                            <item.icon size={22} className={isActive ? "text-[#00E0FF]" : "text-slate-500 group-hover:text-slate-300"} />
                            <span className="font-medium text-sm tracking-wide font-[family-name:var(--font-chakra)] uppercase">{item.label}</span>
                        </Link>
                    )
                })}
            </nav>

            <div className="p-4 mx-4 mb-4 rounded-2xl bg-[#00E0FF]/5 border border-[#00E0FF]/10 cursor-pointer hover:bg-[#00E0FF]/10 hover:border-[#00E0FF]/30 transition-all duration-300 group">
                <div className="flex items-center gap-4 px-2 py-2">
                    <div className="w-10 h-10 rounded-full bg-slate-800 ring-2 ring-[#00E0FF]/30 overflow-hidden relative flex items-center justify-center text-[#00E0FF] font-bold font-[family-name:var(--font-jetbrains)] group-hover:ring-[#00E0FF]/60 transition-all">
                        OK
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-white font-[family-name:var(--font-chakra)]">Olexandr K.</span>
                        <span className="text-[10px] text-[#00E0FF] uppercase tracking-[0.2em] font-[family-name:var(--font-jetbrains)] mt-0.5">Shift Lead</span>
                    </div>
                </div>
            </div>
        </aside>
    );
};
