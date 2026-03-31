'use client';

import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, Send } from 'lucide-react';
import { Modal, ModalBody, ModalButton, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import { OrderItem, SharePlatform } from '@/types/order';
import { formatOrderMessage } from '@/lib/messageFormatter';
import { auditLog } from '@/lib/logger';
import { generateExcel, groupItemsByCategory, prepareWorkbook } from '@/lib/order-export';

interface ShareOptionsModalProps {
    isOpen: boolean;
    items: OrderItem[];
    orderData: any;
    onClose: () => void;
    onShare: (platform: SharePlatform['id']) => void;
}

export const ShareOptionsModal = ({ isOpen, items, orderData, onClose }: ShareOptionsModalProps) => {
    const [copied, setCopied] = useState(false);

    const groupedByCategory = useMemo(() => groupItemsByCategory(items), [items]);
    const messagePreview = useMemo(() => formatOrderMessage(items), [items]);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(messagePreview);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownloadExcel = async () => {
        await auditLog('EXPORT_EXCEL', 'ShareOptionsModal', {
            date: orderData.date,
            totalKg: orderData.totalKg,
            itemCount: items.length,
        });
        await generateExcel(orderData);
    };

    const handleShareExcel = async () => {
        try {
            await auditLog('SHARE_ORDER', 'ShareOptionsModal', {
                date: orderData.date,
                totalKg: orderData.totalKg,
                itemCount: items.length,
            });

            const workbook = await prepareWorkbook(orderData);
            const buffer = await workbook.xlsx.writeBuffer();
            const fileName = `Graviton_${orderData.date.replace(/\./g, '-')}.xlsx`;
            const file = new File([buffer], fileName, {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });

            if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Виробниче замовлення',
                    text: `Замовлення GRAVITON на ${orderData.date}`,
                });
                return;
            }

            await handleDownloadExcel();
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="md">
            <ModalHeader icon={<Send size={20} />}>
                <h2 className="text-base font-bold text-white">Надіслати заявку</h2>
                <p className="mt-1 text-sm text-white/70">Оберіть зручний спосіб передачі файлу або текстового прев’ю.</p>
            </ModalHeader>

            <ModalBody className="space-y-5 bg-slate-50">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                        type="button"
                        onClick={handleShareExcel}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                    >
                        <Send size={16} />
                        Поділитися
                    </button>
                    <button
                        type="button"
                        onClick={handleDownloadExcel}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                        <Download size={16} />
                        Завантажити Excel
                    </button>
                </div>

                <div>
                    <div className="mb-3 flex items-center justify-between">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Попередній перегляд</div>
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                        >
                            {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                            {copied ? 'Скопійовано' : 'Копіювати'}
                        </button>
                    </div>

                    <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                        <div className="space-y-4">
                            {Object.entries(groupedByCategory).map(([category, data]: any) => (
                                <div key={category}>
                                    <div className="border-b border-slate-100 pb-2 text-sm font-bold text-slate-900">
                                        {category}: {data.totalKg} кг
                                    </div>
                                    <div className="mt-2 space-y-1">
                                        {data.items.map((item: any, index: number) => (
                                            <div key={index} className="flex items-center justify-between gap-3 text-sm">
                                                <span className="text-slate-600">{item.productName}</span>
                                                <span className="font-semibold text-slate-900">{item.kg} кг</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </ModalBody>

            <ModalFooter>
                <div className="flex justify-center">
                    <ModalButton variant="secondary" onClick={onClose} className="w-full">Закрити</ModalButton>
                </div>
            </ModalFooter>
        </Modal>
    );
};
