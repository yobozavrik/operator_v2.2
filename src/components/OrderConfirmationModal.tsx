'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Edit2, Package, Trash2 } from 'lucide-react';
import { OrderItem } from '@/types/order';
import { Modal, ModalBody, ModalButton, ModalFooter, ModalHeader } from '@/components/ui/Modal';

interface OrderConfirmationModalProps {
    isOpen: boolean;
    items: OrderItem[];
    onClose: () => void;
    onConfirm: (items: OrderItem[]) => void;
}

export const OrderConfirmationModal = ({ isOpen, items, onClose, onConfirm }: OrderConfirmationModalProps) => {
    const [editedItems, setEditedItems] = useState<OrderItem[]>(items);
    const [editingId, setEditingId] = useState<string | null>(null);

    useEffect(() => {
        setEditedItems(items.filter((item) => item.quantity > 0));
    }, [items]);

    const groupedItems = useMemo(() => {
        const groups = new Map<string, OrderItem[]>();
        editedItems.forEach((item) => {
            if (!groups.has(item.category)) groups.set(item.category, []);
            groups.get(item.category)!.push(item);
        });

        return Array.from(groups.entries()).map(([category, categoryItems]) => ({
            category,
            totalWeight: categoryItems.reduce((sum, item) => sum + item.quantity, 0),
            items: categoryItems.sort((a, b) => a.productName.localeCompare(b.productName)),
        }));
    }, [editedItems]);

    const totalWeight = useMemo(() => editedItems.reduce((sum, item) => sum + item.quantity, 0), [editedItems]);

    const handleQuantityChange = (itemId: string, newQuantity: number) => {
        if (newQuantity <= 0) return;
        setEditedItems((current) => current.map((item) => item.id === itemId ? { ...item, quantity: newQuantity, kg: newQuantity } : item));
    };

    const handleRemoveItem = (itemId: string) => {
        setEditedItems((current) => current.filter((item) => item.id !== itemId));
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="xl" showCloseButton={false}>
            <ModalHeader icon={<Package size={20} />}>
                <div>
                    <h2 className="text-base font-bold text-white">Перевірити заявку</h2>
                    <div className="mt-1 text-sm text-white/70">Загальна вага: {totalWeight.toFixed(1)} кг · Позицій: {editedItems.length}</div>
                </div>
            </ModalHeader>

            <ModalBody className="space-y-4 bg-slate-50">
                {groupedItems.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                        Заявка порожня.
                    </div>
                ) : groupedItems.map((group) => (
                    <div key={group.category} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-semibold text-slate-900">{group.category}</div>
                                <div className="text-sm font-bold text-slate-900">{group.totalWeight.toFixed(1)} кг</div>
                            </div>
                        </div>

                        <div className="divide-y divide-slate-100">
                            {group.items.map((item) => (
                                <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-slate-900">{item.productName}</div>
                                        <div className="mt-1 text-xs text-slate-500">{item.storeName}</div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {editingId === item.id ? (
                                            <input
                                                type="number"
                                                min="0.1"
                                                step="0.5"
                                                value={item.quantity}
                                                onChange={(event) => handleQuantityChange(item.id, parseFloat(event.target.value))}
                                                onBlur={() => setEditingId(null)}
                                                onKeyDown={(event) => event.key === 'Enter' && setEditingId(null)}
                                                className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm font-semibold text-slate-900 outline-none"
                                                autoFocus
                                            />
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setEditingId(item.id)}
                                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900"
                                            >
                                                {item.quantity.toFixed(1)}
                                                <Edit2 size={12} className="text-slate-400" />
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => handleRemoveItem(item.id)}
                                            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-red-700"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </ModalBody>

            <ModalFooter>
                <div className="flex items-center justify-between gap-4">
                    <ModalButton variant="secondary" onClick={onClose}>Назад до відбору</ModalButton>
                    <ModalButton variant="primary" onClick={() => onConfirm(editedItems)} disabled={editedItems.length === 0}>
                        Підтвердити
                    </ModalButton>
                </div>
            </ModalFooter>
        </Modal>
    );
};
