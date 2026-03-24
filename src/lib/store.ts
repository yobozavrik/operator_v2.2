import { create } from 'zustand';

interface StoreState {
    selectedStore: string;
    setSelectedStore: (store: string) => void;
}

export const useStore = create<StoreState>((set) => ({
    selectedStore: 'Усі',
    setSelectedStore: (store) => set({ selectedStore: store }),
}));
