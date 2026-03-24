'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Trash2, Edit2, Package, ChevronDown, ChevronRight } from 'lucide-react';
import { OrderItem } from '@/types/order';
import { SKUCategory } from '@/types/bi';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cn } from '@/lib/utils';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalButton } from '@/components/ui/Modal';

interface OrderConfirmationModalProps {
    isOpen: boolean;
    items: OrderItem[];
    onClose: () => void;
    onConfirm: (items: OrderItem[]) => void;
}

const CATEGORY_EMOJI: Record<string, string> = {
    'ВАРЕНИКИ': '🥟',
    'ПЕЛЬМЕНІ': '🥢',
    'ХІНКАЛІ': '🥡',
    'ЧЕБУРЕКИ': '🌯',
    'КОВБАСКИ': '🌭',
    'ГОЛУБЦІ': '🥬',
    'КОТЛЕТИ': '🥩',
    'СИРНИКИ': '🥞',
    'ФРИКАДЕЛЬКИ': '🧆',
    'ЗРАЗИ': '🥔',
    'ПЕРЕЦЬ ФАРШИРОВАНИЙ': '🫑',
    'МЛИНЦІ': '🥞',
    'БЕНДЕРИКИ': '🌮'
};

const getEmoji = (category: string) => CATEGORY_EMOJI[category] || '📦';

export const OrderConfirmationModal = ({ isOpen, items, onClose, onConfirm }: OrderConfirmationModalProps) => {
    const [editedItems, setEditedItems] = useState<OrderItem[]>(items);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [expandedCategories, setExpandedCategories] = useState<Set<SKUCategory>>(new Set());

    // Sync editedItems when items prop changes and filter out zero quantities
    useEffect(() => {
        const filtered = items.filter(item => item.quantity > 0);
        setEditedItems(filtered);

        // Auto-expand all initially
        const allCats = new Set(filtered.map(i => i.category));
        setExpandedCategories(allCats);
    }, [items]);

    const toggleAllCategories = () => {
        if (expandedCategories.size > 0) {
            setExpandedCategories(new Set());
        } else {
            const allCats = new Set(groupedItems.map(g => g.category));
            setExpandedCategories(allCats);
        }
    };

    const toggleCategory = (category: SKUCategory) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(category)) next.delete(category);
            else next.add(category);
            return next;
        });
    };

    // Group by category
    const groupedItems = useMemo(() => {
        const groups = new Map<SKUCategory, OrderItem[]>();

        // Only include items with quantity > 0
        editedItems.filter(item => item.quantity > 0).forEach(item => {
            if (!groups.has(item.category)) {
                groups.set(item.category, []);
            }
            groups.get(item.category)!.push(item);
        });

        return Array.from(groups.entries()).map(([category, items]) => ({
            category,
            emoji: getEmoji(category),
            totalWeight: items.reduce((sum, item) => sum + item.quantity, 0),
            items: items.sort((a, b) => a.productName.localeCompare(b.productName))
        }));
    }, [editedItems]);

    const totalWeight = useMemo(() => {
        return editedItems.reduce((sum, item) => sum + item.quantity, 0);
    }, [editedItems]);

    const handleQuantityChange = (itemId: string, newQuantity: number) => {
        if (newQuantity <= 0) return;

        setEditedItems(prev =>
            prev.map(item =>
                item.id === itemId ? { ...item, quantity: newQuantity, kg: newQuantity } : item
            )
        );
    };

    const handleRemoveItem = (itemId: string) => {
        setEditedItems(prev => prev.filter(item => item.id !== itemId));
    };

    const handleConfirm = () => {
        if (editedItems.length === 0) {
            alert('Замовлення порожнє!');
            return;
        }
        onConfirm(editedItems);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="xl" showCloseButton={false}>
            {/* Header */}
            <ModalHeader icon={<Package size={20} />}>
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-[14px] font-black uppercase tracking-[0.08em] text-white">
                            Попередній перегляд заявки
                        </h2>
                        <div className="flex items-center gap-5 mt-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] text-white/30 uppercase font-bold tracking-widest">
                                    Вага:
                                </span>
                                <span className="text-[14px] font-black text-[#00D4FF]">
                                    {totalWeight.toFixed(1)} кг
                                </span>
                            </div>
                            <div className="h-4 w-[1px] bg-white/10" />
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] text-white/30 uppercase font-bold tracking-widest">
                                    Позицій:
                                </span>
                                <span className="text-[12px] font-bold text-white/90">
                                    {editedItems.length}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={toggleAllCategories}
                        className="px-3 py-1.5 text-[9px] font-bold text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 hover:border-white/10 transition-all"
                    >
                        {expandedCategories.size > 0 ? 'ЗГОРНУТИ ВСЕ' : 'РОЗГОРНУТИ ВСЕ'}
                    </button>
                </div>
            </ModalHeader>

            {/* Content */}
            <ModalBody className="space-y-3 bg-[#0A0E14]">
                {groupedItems.length === 0 ? (
                    <div className="text-center py-16 text-white/40">
                        <Package size={48} className="mx-auto mb-4 opacity-30" />
                        <p className="text-[14px] font-semibold">Замовлення порожнє</p>
                        <p className="text-[12px] mt-2 opacity-60">Додайте товари до замовлення</p>
                    </div>
                ) : (
                    groupedItems.map(group => (
                        <div
                            key={group.category}
                            className="bg-white/[0.02] rounded-xl border border-white/5 overflow-hidden hover:border-white/10 transition-colors"
                        >
                            {/* Category Header */}
                            <div
                                className="px-4 py-3 bg-white/[0.02] border-b border-white/5 cursor-pointer hover:bg-white/[0.04] transition-colors group"
                                onClick={() => toggleCategory(group.category)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="text-white/30 group-hover:text-white/50 transition-colors">
                                            {expandedCategories.has(group.category) ? (
                                                <ChevronDown size={14} />
                                            ) : (
                                                <ChevronRight size={14} />
                                            )}
                                        </div>
                                        <span className="text-[18px]">{group.emoji}</span>
                                        <span className="text-[13px] font-black uppercase text-white/90">
                                            {group.category}
                                        </span>
                                        <span className="text-[10px] text-white/30 font-medium">
                                            ({group.items.length})
                                        </span>
                                    </div>
                                    <span className="text-[14px] font-black text-[#00D4FF]">
                                        {group.totalWeight.toFixed(1)} кг
                                    </span>
                                </div>
                            </div>

                            {/* Items */}
                            {expandedCategories.has(group.category) && (
                                <div className="divide-y divide-white/[0.03]">
                                    {group.items.map(item => (
                                        <div
                                            key={item.id}
                                            className="px-4 py-3 hover:bg-white/[0.02] transition-colors group/item"
                                        >
                                            <div className="flex items-center justify-between gap-4">
                                                {/* Product Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[12px] font-bold text-white/80 truncate group-hover/item:text-white transition-colors">
                                                        {item.productName}
                                                    </div>
                                                    <div className="text-[10px] text-white/30 mt-0.5">
                                                        🏪 {item.storeName}
                                                    </div>
                                                </div>

                                                {/* Quantity Editor */}
                                                <div className="flex items-center gap-2">
                                                    {editingId === item.id ? (
                                                        <input
                                                            type="number"
                                                            min="0.1"
                                                            step="0.5"
                                                            value={item.quantity}
                                                            onChange={(e) => handleQuantityChange(item.id, parseFloat(e.target.value))}
                                                            onBlur={() => setEditingId(null)}
                                                            onKeyDown={(e) => e.key === 'Enter' && setEditingId(null)}
                                                            className="w-20 px-2 py-1.5 bg-black/50 border border-[#00D4FF] rounded-lg text-[12px] font-black text-[#00D4FF] text-center focus:outline-none focus:ring-2 focus:ring-[#00D4FF]/30"
                                                            autoFocus
                                                        />
                                                    ) : (
                                                        <button
                                                            onClick={() => setEditingId(item.id)}
                                                            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg hover:border-[#00D4FF]/50 hover:bg-[#00D4FF]/5 transition-all group/btn"
                                                        >
                                                            <span className="text-[13px] font-black text-[#00D4FF]">
                                                                {item.quantity.toFixed(1)}
                                                            </span>
                                                            <Edit2 size={12} className="text-white/20 group-hover/btn:text-[#00D4FF]/50 transition-colors" />
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => handleRemoveItem(item.id)}
                                                        className="p-2 text-white/20 hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded-lg transition-all"
                                                        title="Видалити"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </ModalBody>

            {/* Footer */}
            <ModalFooter>
                <div className="flex items-center justify-between gap-4">
                    <ModalButton variant="secondary" onClick={onClose}>
                        Назад до відбору
                    </ModalButton>

                    <ModalButton
                        variant="primary"
                        onClick={handleConfirm}
                        disabled={editedItems.length === 0}
                    >
                        Підтвердити й перейти до надсилання
                    </ModalButton>
                </div>
            </ModalFooter>
        </Modal>
    );
};
