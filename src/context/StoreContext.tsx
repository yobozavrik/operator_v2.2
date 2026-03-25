'use client';

import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react';

type StoreContextType = {
    selectedStore: string;
    setSelectedStore: (store: string) => void;
    currentCapacity: number | null;
    setCurrentCapacity: (capacity: number | null) => void;
};

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider = ({ children }: { children: ReactNode }) => {
    const [selectedStore, setSelectedStoreState] = useState<string>('Усі');
    const [currentCapacity, setCurrentCapacityState] = useState<number | null>(null);

    const setSelectedStore = useCallback((store: string) => setSelectedStoreState(store), []);
    const setCurrentCapacity = useCallback((capacity: number | null) => setCurrentCapacityState(capacity), []);

    const value = useMemo(
        () => ({ selectedStore, setSelectedStore, currentCapacity, setCurrentCapacity }),
        [selectedStore, setSelectedStore, currentCapacity, setCurrentCapacity]
    );

    return (
        <StoreContext.Provider value={value}>
            {children}
        </StoreContext.Provider>
    );
};

export const useStore = () => {
    const context = useContext(StoreContext);
    if (context === undefined) {
        throw new Error('useStore must be used within a StoreProvider');
    }
    return context;
};
