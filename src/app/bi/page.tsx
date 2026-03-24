'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect old /bi route to main dashboard at /
export default function BIRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/');
    }, [router]);

    return (
        <div className="flex items-center justify-center min-h-screen bg-[#0A1931] text-white/50">
            Перенаправлення...
        </div>
    );
}
