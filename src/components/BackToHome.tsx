'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

interface BackToHomeProps {
    href?: string;
    label?: string;
    className?: string;
}

export const BackToHome = ({
    href = '/',
    label = 'До головного меню',
    className = ''
}: BackToHomeProps) => {
    const router = useRouter();

    return (
        <button
            onClick={() => router.push(href)}
            className={`flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors group mb-1 pl-1 w-fit ${className}`}
        >
            <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-[11px] font-medium uppercase tracking-widest">{label}</span>
        </button>
    );
};
