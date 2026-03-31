'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AlertTriangle, ArrowLeft, BarChart2, Factory, Home, MapPinned, Truck } from 'lucide-react';

const NAV_ITEMS = [
    { href: '/graviton', label: 'Огляд', icon: BarChart2 },
    { href: '/graviton/distribution', label: 'Розподіл', icon: Truck },
    { href: '/graviton/debt', label: 'Борг', icon: AlertTriangle },
    { href: '/graviton/stores', label: 'Магазини', icon: MapPinned },
    { href: '/graviton/analytics', label: 'Аналітика', icon: Factory },
];

export default function GravitonLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();

    const handleBack = () => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
            return;
        }
        router.push('/ops');
    };

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900">
            <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-4 py-4 md:px-6 md:py-6">
                <header className="mb-4 shrink-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                                <Factory size={12} />
                                Graviton
                            </div>
                            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Гравітон</h1>
                            <p className="mt-1 text-sm text-slate-600">Операційний контур мережі: дефіцит, відбір, розподіл, доставка.</p>
                        </div>

                        <div className="flex flex-col gap-3 xl:items-end">
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                >
                                    <ArrowLeft size={15} />
                                    Назад
                                </button>
                                <Link
                                    href="/"
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                >
                                    <Home size={15} />
                                    Головне меню
                                </Link>
                            </div>

                            <nav className="flex flex-wrap items-center gap-2">
                                {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                                    const active = pathname === href || (href !== '/graviton' && pathname.startsWith(href));
                                    return (
                                        <Link
                                            key={href}
                                            href={href}
                                            className={cn(
                                                'inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors',
                                                active
                                                    ? 'border-slate-900 bg-slate-900 text-white'
                                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                            )}
                                        >
                                            <Icon size={15} />
                                            {label}
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>
                    </div>
                </header>

                <main className="min-h-0 flex-1">{children}</main>
            </div>
        </div>
    );
}
