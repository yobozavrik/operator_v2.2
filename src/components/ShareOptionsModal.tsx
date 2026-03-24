'use client';

import React, { useState, useMemo } from 'react';
import { Send, Download, Copy, Check } from 'lucide-react';
import { OrderItem, SharePlatform } from '@/types/order';
import { formatOrderMessage } from '@/lib/messageFormatter';
import { groupItemsByCategory, generateExcel, prepareWorkbook } from '@/lib/order-export';
import { auditLog } from '@/lib/logger';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalButton } from '@/components/ui/Modal';

interface ShareOptionsModalProps {
    isOpen: boolean;
    items: OrderItem[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orderData: any;
    onClose: () => void;
    onShare: (platform: SharePlatform['id']) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const ShareOptionsModal = ({ isOpen, items, orderData, onClose, onShare }: ShareOptionsModalProps) => {
    const [copied, setCopied] = useState(false);

    const handleDownloadExcel = async () => {
        // Log export action
        await auditLog('EXPORT_EXCEL', 'ShareOptionsModal', {
            date: orderData.date,
            totalKg: orderData.totalKg,
            itemCount: items.length
        });

        const fileName = await generateExcel(orderData);
        alert(`Файл збережено: ${fileName}`);
    };

    const handleShareExcel = async () => {
        try {
            // Log share action
            await auditLog('SHARE_ORDER', 'ShareOptionsModal', {
                date: orderData.date,
                totalKg: orderData.totalKg,
                itemCount: items.length
            });

            const workbook = await prepareWorkbook(orderData);
            const buffer = await workbook.xlsx.writeBuffer();
            const fileName = `Graviton_${orderData.date.replace(/\./g, '-')}.xlsx`;
            const shareText = `Замовлення GRAVITON на ${orderData.date}\nЗагальна вага: ${orderData.totalKg} кг`;
            const file = new File(
                [buffer],
                fileName,
                { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
            );

            const downloadFile = () => {
                const blob = new Blob([buffer], {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                link.click();
                window.URL.revokeObjectURL(url);
            };

            const hasShareApi = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
            const canShareFiles = hasShareApi
                && typeof navigator.canShare === 'function'
                && navigator.canShare({ files: [file] });

            if (canShareFiles) {
                await navigator.share({
                    files: [file],
                    title: 'Виробниче замовлення',
                    text: shareText
                });
                return;
            }

            if (hasShareApi) {
                try {
                    await navigator.share({
                        title: 'Виробниче замовлення',
                        text: shareText
                    });
                } catch (shareError) {
                    console.warn('Text share failed:', shareError);
                }
            }

            downloadFile();
            alert('Ваш браузер не підтримує надсилання файлів. Файл завантажено, додайте його в Telegram/WhatsApp/Viber вручну.');
        } catch (error) {
            console.error('Помилка при поділитися:', error);
            await auditLog('ERROR', 'ShareOptionsModal', { error: String(error) });
            alert('Помилка при поділитися файлом');
        }
    };


    const messagePreview = useMemo(() => {
        return formatOrderMessage(items);
    }, [items]);

    const groupedByCategory = useMemo(() => {
        return groupItemsByCategory(items);
    }, [items]);

    const handleCopy = () => {
        navigator.clipboard.writeText(messagePreview);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="md">
            {/* Header */}
            <ModalHeader icon={<Send size={20} />}>
                <h2 className="text-[16px] font-black uppercase tracking-tight text-white">
                    Поділитися замовленням
                </h2>
                <p className="text-[11px] text-white/40 mt-1">
                    Оберіть спосіб надсилання
                </p>
            </ModalHeader>

            {/* Content */}
            <ModalBody className="space-y-6">
                {/* Action Buttons */}
                <div className="space-y-4">
                    <h3 className="text-[11px] font-bold uppercase text-white/40 tracking-widest text-center">
                        Оберіть дію
                    </h3>

                    <div className="flex gap-3">
                        {/* Share Button */}
                        <button
                            onClick={handleShareExcel}
                            className="flex-1 flex items-center justify-center gap-2.5 px-6 py-4 rounded-xl font-bold text-[13px] transition-all hover:scale-[1.02] active:scale-[0.98] bg-gradient-to-r from-[#0088FF] to-[#00D4FF] text-white shadow-lg shadow-[#0088FF]/20 hover:shadow-xl hover:shadow-[#00D4FF]/30"
                        >
                            <Send size={18} />
                            Поділитися
                        </button>

                        {/* Download Button */}
                        <button
                            onClick={handleDownloadExcel}
                            className="flex-1 flex items-center justify-center gap-2.5 px-6 py-4 rounded-xl font-bold text-[13px] transition-all hover:scale-[1.02] active:scale-[0.98] bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-white"
                        >
                            <Download size={18} className="text-[#00D4FF]" />
                            Завантажити
                        </button>
                    </div>
                </div>

                {/* Message Preview */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[11px] font-bold uppercase text-white/40 tracking-widest">
                            Попередній перегляд
                        </h3>
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[11px] font-bold text-white/70 hover:text-white hover:border-white/20 hover:bg-white/10 transition-all"
                        >
                            {copied ? (
                                <>
                                    <Check size={12} className="text-[#10B981]" />
                                    Скопійовано
                                </>
                            ) : (
                                <>
                                    <Copy size={12} />
                                    Копіювати
                                </>
                            )}
                        </button>
                    </div>

                    <div className="bg-black/30 border border-white/5 rounded-xl p-5 font-sans text-[13px] text-white/80 leading-relaxed max-h-[280px] overflow-y-auto custom-scrollbar">
                        <div className="space-y-4">
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            {Object.entries(groupedByCategory).map(([category, data]: any) => (
                                <div key={category} className="space-y-1">
                                    <div className="font-black text-[#00D4FF] border-b border-white/5 pb-1 mb-2">
                                        {category.toUpperCase()}: {data.totalKg} кг
                                    </div>
                                    <div className="pl-2 space-y-1.5 opacity-90">
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        {data.items.map((item: any, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center text-[12px]">
                                                <span className="text-white/70">• {item.productName}</span>
                                                <span className="font-bold text-[#00D4FF]">{item.kg} кг</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {Object.keys(groupedByCategory).length === 0 && (
                                <p className="text-center opacity-40 py-8">Немає вибраних товарів</p>
                            )}
                        </div>
                    </div>
                </div>
            </ModalBody>

            {/* Footer */}
            <ModalFooter>
                <div className="flex justify-center">
                    <ModalButton variant="secondary" onClick={onClose} className="w-full">
                        Закрити
                    </ModalButton>
                </div>
            </ModalFooter>
        </Modal>
    );
};
