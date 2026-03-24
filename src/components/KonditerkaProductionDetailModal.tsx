'use client';

import React from 'react';
import useSWR from 'swr';
import { ChefHat, Loader2, AlertCircle } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalButton } from '@/components/ui/Modal';

interface KonditerkaProductionDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface ProductionItem {
    product_name: string;
    baked_at_factory: number;
}

export const KonditerkaProductionDetailModal = ({ isOpen, onClose }: KonditerkaProductionDetailModalProps) => {
    const { data, error, isLoading } = useSWR<ProductionItem[]>(
        isOpen ? '/api/konditerka/production-detail' : null,
        (url) => fetch(url, { credentials: 'include' }).then(r => r.json()),
        { refreshInterval: 10000 }
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="sm">
            {/* Header */}
            <ModalHeader icon={<ChefHat size={20} />}>
                <h2 className="text-lg font-bold text-text-primary uppercase tracking-wide">
                    Виробництво
                </h2>
                <p className="text-xs text-text-muted uppercase tracking-widest mt-1">
                    Детальна статистика (24 год)
                </p>
            </ModalHeader>

            {/* Content */}
            <ModalBody noPadding className="bg-bg-primary">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-text-muted gap-3">
                        <div className="relative">
                            <Loader2 size={32} className="animate-spin text-accent-primary" />
                            <div className="absolute inset-0 blur-xl bg-accent-primary/20 animate-pulse" />
                        </div>
                        <span className="text-xs font-mono uppercase tracking-widest">Завантаження даних...</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <div className="w-16 h-16 rounded-full bg-status-critical/10 flex items-center justify-center text-status-critical">
                            <AlertCircle size={32} />
                        </div>
                        <span className="text-sm font-bold text-status-critical">Помилка завантаження</span>
                        <span className="text-xs font-mono text-text-muted">{String(error)}</span>
                    </div>
                ) : data && data.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-panel-bg z-10 text-[10px] uppercase font-bold tracking-widest text-text-muted border-b border-panel-border">
                            <tr>
                                <th className="p-4 pl-6">Кондитерка</th>
                                <th className="p-4 pr-6 text-right">Кількість</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-panel-border">
                            {data.map((item, i) => (
                                <tr key={i} className="group hover:bg-bg-primary/50 transition-colors">
                                    <td className="p-4 pl-6 text-sm font-medium text-text-primary/80 group-hover:text-text-primary transition-colors">
                                        {item.product_name}
                                    </td>
                                    <td className="p-4 pr-6 text-right">
                                        <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-accent-primary/10 text-accent-primary font-mono text-sm font-bold min-w-[3.5rem]">
                                            {item.baked_at_factory}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                        <ChefHat size={40} className="mb-4 opacity-50" />
                        <span className="text-sm font-medium">Дані відсутні</span>
                        <span className="text-xs mt-1 opacity-60">Немає записів за останні 24 години</span>
                    </div>
                )}
            </ModalBody>

            {/* Footer */}
            <ModalFooter>
                <div className="flex justify-end">
                    <ModalButton variant="secondary" onClick={onClose}>
                        Закрити
                    </ModalButton>
                </div>
            </ModalFooter>
        </Modal>
    );
};
