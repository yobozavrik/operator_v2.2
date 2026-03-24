import { SKUCategory, PriorityKey } from './bi';

export interface OrderItem {
    id: string;
    productCode: number;
    productName: string;
    category: SKUCategory;
    storeName: string;
    quantity: number;
    kg: number;
    priority: PriorityKey;
    minRequired?: number;
    maxRecommended?: number;
}

export interface SavedOrder {
    id: string;
    date: string;
    totalWeight: number;
    items: OrderItem[];
    status: 'sent' | 'pending' | 'completed';
    sentTo: ('telegram' | 'viber' | 'whatsapp')[];
    createdBy: string;
}

export interface ProductionOrder {
    date: string;
    totalKg: number;
    items: OrderItem[];
}

export interface SharePlatform {
    id: 'telegram' | 'viber' | 'whatsapp' | 'download';
    label: string;
    icon: string;
    color: string;
}
