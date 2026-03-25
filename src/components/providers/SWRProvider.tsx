'use client';

import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

// Global SWR defaults:
// - dedupingInterval: не відправляти повторний запит якщо такий самий вже є в кеші < 60s
// - revalidateOnFocus: не рефетчити при поверненні у вкладку (дані оновлюються за refreshInterval)
// - focusThrottleInterval: навіть якщо revalidateOnFocus увімкнений — не частіше ніж раз на 5хв
// - errorRetryCount: 2 спроби при помилці, потім зупинитись
export function SWRProvider({ children }: { children: ReactNode }) {
    return (
        <SWRConfig
            value={{
                dedupingInterval: 60_000,
                revalidateOnFocus: false,
                revalidateOnReconnect: true,
                focusThrottleInterval: 300_000,
                errorRetryCount: 2,
                errorRetryInterval: 5_000,
                shouldRetryOnError: true,
            }}
        >
            {children}
        </SWRConfig>
    );
}
