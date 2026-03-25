'use client';

import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[Foodcost Error Boundary]', error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
            <p className="text-lg font-semibold text-text-primary">Помилка завантаження Foodcost</p>
            <p className="text-sm text-text-secondary max-w-sm">
                {error.message || 'Не вдалось завантажити дані собівартості.'}
            </p>
            <button
                type="button"
                onClick={reset}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
                Спробувати ще раз
            </button>
        </div>
    );
}
