'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

type StoreContextType = {
    selectedStore: string;
    setSelectedStore: (store: string) => void;
    currentCapacity: number | null;
    setCurrentCapacity: (capacity: number | null) => void;
};

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider = ({ children }: { children: ReactNode }) => {
    const [selectedStore, setSelectedStore] = useState<string>('Усі');
    const [currentCapacity, setCurrentCapacity] = useState<number | null>(null); // Default: null (must select shift)

    return (
        <StoreContext.Provider value={{
            selectedStore,
            setSelectedStore,
            currentCapacity,
            setCurrentCapacity
        }}>
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
