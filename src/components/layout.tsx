'use client';

import React, { useState, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { LogOut, Factory, Truck, Users, ClipboardList, LayoutDashboard, BarChart3, PieChart, Briefcase, ShieldAlert, Wallet, FlaskConical } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { auditLog } from '@/lib/logger';

import { useStore } from '@/context/StoreContext';

const STORES_MENU = [
    { label: 'Уся мережа', slug: 'all' },
    { label: 'Магазин «Садгора»', slug: 'sadova' },
    { label: 'Магазин «Компас»', slug: 'kompas' },
    { label: 'Магазин «Руська»', slug: 'ruska' },
    { label: 'Магазин «Хотинська»', slug: 'hotynska' },
    { label: 'Магазин «Білоруська»', slug: 'biloruska' },
    { label: 'Магазин «Кварц»', slug: 'kvarc' },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const storeGradients = [
    { gradient: 'linear-gradient(135deg, #00BCF2 0%, #0099FF 100%)', glow: '#00D4FF' },  // Azure - ярче
    { gradient: 'linear-gradient(135deg, #2E7CFF 0%, #1E5FCC 100%)', glow: '#4A90FF' },  // Sapphire - ярче
    { gradient: 'linear-gradient(135deg, #52E8FF 0%, #00D4FF 100%)', glow: '#7FFFD4' },  // Electric - ярче
    { gradient: 'linear-gradient(135deg, #00BCF2 0%, #0099DD 100%)', glow: '#00D4FF' },  // Cerulean - ярче
    { gradient: 'linear-gradient(135deg, #0066FF 0%, #0044BB 100%)', glow: '#0088FF' },  // Navy - ярче
    { gradient: 'linear-gradient(135deg, #A0FFFF 0%, #7FECEC 100%)', glow: '#CAFFFF' },  // Celeste - ярче
    { gradient: 'linear-gradient(135deg, #00BCF2 0%, #0099FF 100%)', glow: '#00D4FF' },  // Fallback
];

export const Sidebar = () => {
    const { selectedStore, setSelectedStore } = useStore();
    const [hoveredStore, setHoveredStore] = useState<number | null>(null);
    const [isMounted, setIsMounted] = useState(false);
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Universal menu item renderer (light theme)
    const renderMenuItem = (item: { label: string; icon: React.ComponentType<{ size: number }>; path: string }, i: number, isActive: boolean, onClick: () => void) => {
        const Icon = item.icon;
        return (
            <button
                key={i}
                onClick={onClick}
                className={cn(
                    "w-full px-4 py-3 text-left rounded-xl transition-all duration-200 relative overflow-hidden group flex items-center gap-3 border",
                    isActive
                        ? "bg-blue-50 border-blue-200 shadow-sm"
                        : "bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200"
                )}
            >
                {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-blue-500" />
                )}
                <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                    isActive ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400 group-hover:text-slate-600"
                )}>
                    <Icon size={18} />
                </div>
                <span className={cn(
                    "text-[12px] font-bold uppercase tracking-wide",
                    isActive ? "text-blue-700" : "text-slate-500 group-hover:text-slate-700"
                )}>
                    {item.label}
                </span>
            </button>
        );
    };

    const isOwnerMode = pathname?.startsWith('/owner');
    const isPizzaMode = pathname?.startsWith('/pizza');
    const isKonditerkaMode = pathname?.startsWith('/konditerka');
    const isFloridaMode = pathname?.startsWith('/florida');
    const isBulvarMode = pathname?.startsWith('/bulvar');

    const OWNER_MENU = [
        { label: 'Дашборд', icon: Briefcase, path: '/owner' },
        { label: 'Фудкост', icon: PieChart, path: '/owner/foodcost' },
        { label: 'Фінанси', icon: Wallet, path: '/finance' },
        { label: 'Опер. директор', icon: ShieldAlert, path: '/ops' },
        { label: 'Нач. виробництва', icon: Factory, path: '/production-chief' },
        { label: 'Нач. постачання', icon: Truck, path: '/supply-chief' },
        { label: 'Відділ кадрів', icon: Users, path: '/hr' },
        { label: 'Технолог', icon: FlaskConical, path: '#' },
    ];

    const PIZZA_MENU = [
        { label: 'Огляд', icon: LayoutDashboard, path: '/pizza' },
        { label: 'Аналітика', icon: PieChart, path: '/pizza/analytics' },
        { label: 'Виробництво', icon: BarChart3, path: '/pizza/production' },
        { label: 'Персонал', icon: Users, path: '/pizza/personnel' },
        { label: 'Заявка', icon: ClipboardList, path: '/pizza/order-form' }
    ];

    const KONDITERKA_MENU = [
        { label: 'Огляд', icon: LayoutDashboard, path: '/konditerka' },
        { label: 'Виробництво', icon: BarChart3, path: '/konditerka/production' },
        { label: 'Персонал', icon: Users, path: '/konditerka/personnel' },
        { label: 'Заявка', icon: ClipboardList, path: '/konditerka/order-form' }
    ];

    const FLORIDA_MENU = [
        { label: 'Огляд', icon: LayoutDashboard, path: '/florida' },
        { label: 'Виробництво', icon: BarChart3, path: '/florida/production' },
        { label: 'Персонал', icon: Users, path: '/florida/personnel' },
        { label: 'Заявка', icon: ClipboardList, path: '/florida/order-form' }
    ];

    const BULVAR_MENU = [
        { label: 'Огляд', icon: LayoutDashboard, path: '/bulvar' },
        { label: 'Виробництво', icon: BarChart3, path: '/bulvar/production' },
        { label: 'Персонал', icon: Users, path: '/bulvar/personnel' },
        { label: 'Заявка', icon: ClipboardList, path: '/bulvar/order-form' }
    ];


    return (
        <>
            {/* Desktop Sidebar */}
            <aside
                className="hidden lg:flex border-r border-slate-200 bg-white h-screen sticky top-0 flex-col py-6 relative overflow-hidden"
                style={{ width: 'var(--sidebar-width)' }}
            >

                {/* Optional: Subtle Wave Gradient/Glow to mimic the reference image vibe */}
                <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-blue-50/50 to-transparent pointer-events-none" />

                <div className="px-6 mb-8 z-10">
                    <div
                        className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50"
                    >
                        {/* Logo Icon */}
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500 shadow-sm"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M12 2C8 2 6 6 6 10C6 14 8 18 12 22C16 18 18 14 18 10C18 6 16 2 12 2Z" fill="white" opacity="0.9" />
                                <path d="M12 6C10 6 9 8 9 10C9 12 10 14 12 16C14 14 15 12 15 10C15 8 14 6 12 6Z" fill="rgba(0,136,255,0.5)" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-[10px] font-bold text-blue-500 tracking-wide uppercase">АНАЛІТИЧНА СИСТЕМА</h1>
                            <p className="text-[16px] text-slate-900 font-black uppercase tracking-widest">ГАЛЯ</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar z-10">
                    <p className="px-2 text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-4 mt-4">
                        {isOwnerMode ? 'Контури' : isPizzaMode || isKonditerkaMode || isFloridaMode || isBulvarMode ? 'Розділи' : 'Магазини'}
                    </p>

                    {isOwnerMode ? (
                        OWNER_MENU.map((item, i) => renderMenuItem(item, i, isMounted && pathname === item.path, () => item.path !== '#' && router.push(item.path)))
                    ) : isPizzaMode ? (
                        PIZZA_MENU.map((item, i) => renderMenuItem(item, i, isMounted && pathname === item.path, () => router.push(item.path)))
                    ) : isKonditerkaMode ? (
                        KONDITERKA_MENU.map((item, i) => renderMenuItem(item, i, isMounted && pathname === item.path, () => router.push(item.path)))
                    ) : isFloridaMode ? (
                        FLORIDA_MENU.map((item, i) => renderMenuItem(item, i, isMounted && pathname === item.path, () => router.push(item.path)))
                    ) : isBulvarMode ? (
                        BULVAR_MENU.map((item, i) => renderMenuItem(item, i, isMounted && pathname === item.path, () => router.push(item.path)))
                    ) : (
                        /* ---- STORE MENU ---- */
                        <div className="flex flex-col gap-1">
                            {STORES_MENU.map((item, i) => {
                                const isActive = selectedStore === item.label;
                                const isHovered = hoveredStore === i;

                                return (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            setSelectedStore(item.label);
                                            auditLog('CHANGE_STORE', 'Sidebar', { store: item.label });
                                            router.push(item.slug === 'all' ? '/graviton' : `/graviton/${item.slug}`);
                                        }}
                                        onMouseEnter={() => setHoveredStore(i)}
                                        onMouseLeave={() => setHoveredStore(null)}
                                        className={cn(
                                            "w-full px-4 py-3 text-center rounded-xl transition-all duration-200 relative overflow-hidden group border",
                                            isActive
                                                ? "bg-blue-50 border-blue-200 shadow-sm"
                                                : isHovered
                                                    ? "bg-slate-50 border-slate-200"
                                                    : "bg-white border-slate-100"
                                        )}
                                    >
                                        {isActive && (
                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-blue-500" />
                                        )}

                                        <div className="relative z-10">
                                            <span
                                                className={cn(
                                                    "text-[12px] font-semibold uppercase tracking-wide transition-all duration-200",
                                                    isActive
                                                        ? "text-blue-600"
                                                        : isHovered
                                                            ? "text-slate-700"
                                                            : "text-slate-500"
                                                )}
                                            >
                                                {item.label}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>



                <div className="px-4 mt-6 pt-4 border-t border-slate-200 z-10 space-y-2">
                    {/* Main Menu Button */}
                    <button
                        onClick={() => router.push('/')}
                        className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-50 text-xs font-semibold uppercase transition-colors"
                    >
                        <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center border border-slate-200">
                            <LayoutDashboard size={14} />
                        </div>
                        Головне меню
                    </button>

                    {/* Logout Button */}
                    <button
                        onClick={async () => {
                            await auditLog('LOGOUT', 'Sidebar', { timestamp: new Date().toISOString() });
                            const { createClient } = await import('@/utils/supabase/client');
                            const supabase = createClient();
                            await supabase.auth.signOut();
                            window.location.href = '/login';
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 text-xs font-semibold uppercase transition-colors"
                    >
                        <LogOut size={16} />
                        Вихід
                    </button>
                </div>
            </aside>

            {/* Mobile Bottom Bar */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-xl border-t border-slate-200 flex items-center justify-around px-2 z-50">
                {(isPizzaMode ? PIZZA_MENU : isKonditerkaMode ? KONDITERKA_MENU : isFloridaMode ? FLORIDA_MENU : isBulvarMode ? BULVAR_MENU : null)?.map((item, i) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.path;
                    return (
                        <button
                            key={i}
                            onClick={() => router.push(item.path)}
                            className={cn(
                                "flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-all",
                                isActive
                                    ? "text-blue-500 bg-blue-50 scale-105"
                                    : "text-slate-400 hover:text-slate-700"
                            )}
                        >
                            <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                            <span className="text-[9px] font-bold uppercase tracking-tight text-center leading-tight">
                                {item.label}
                            </span>
                        </button>
                    );
                }) || (
                    // DEFAULT MODE: Show Stores
                    STORES_MENU.slice(0, 5).map((item, i) => (
                        <button
                            key={i}
                            onClick={() => setSelectedStore(item.label)}
                            className={cn(
                                "flex flex-col items-center gap-1 px-2 py-1 rounded-lg transition-all",
                                selectedStore === item.label
                                    ? "text-blue-500 bg-blue-50"
                                    : "text-slate-400"
                            )}
                        >
                            <span className="text-[9px] font-bold uppercase tracking-tight text-center leading-tight">
                                {item.label.replace('Магазин ', '')}
                            </span>
                        </button>
                    ))
                )}
            </div>
        </>
    );
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { StoreProvider } from '@/context/StoreContext';

// Particle component for background animation
// Particle component for background animation
const ParticleGrid = () => {
    const [particles, setParticles] = useState<Array<{ id: number; left: string; top: string; delay: string; duration: string }>>([]);

    useEffect(() => {
        const newParticles = Array.from({ length: 30 }, (_, i) => ({
            id: i,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            delay: `${Math.random() * 4}s`,
            duration: `${3 + Math.random() * 3}s`,
        }));
        setParticles(newParticles);
    }, []);

    return (
        <div className="particle-grid">
            {particles.map(p => (
                <div
                    key={p.id}
                    className="particle"
                    style={{
                        left: p.left,
                        top: p.top,
                        animationDelay: p.delay,
                        animationDuration: p.duration,
                    }}
                />
            ))}
        </div>
    );
};

export const DashboardLayout = ({
    children,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    currentWeight,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    maxWeight,
    fullHeight = false
}: {
    children: React.ReactNode,
    currentWeight?: number,
    maxWeight?: number | null,
    fullHeight?: boolean
}) => {
    return (
        <div className="flex h-screen bg-slate-50 text-slate-900 font-sans antialiased overflow-hidden relative">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 h-full relative z-10">
                <main className={cn(
                    "flex-1 flex flex-col min-h-0",
                    !fullHeight && "overflow-y-auto p-4 md:p-6 lg:p-8"
                )}>
                    {children}
                </main>
            </div>
        </div>
    );
};
