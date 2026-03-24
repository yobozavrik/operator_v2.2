'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ===== Types =====

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    type: ToastType;
    title: string;
    description?: string;
    duration?: number;
}

interface ToastContextType {
    toasts: Toast[];
    addToast: (toast: Omit<Toast, 'id'>) => void;
    removeToast: (id: string) => void;
    success: (title: string, description?: string) => void;
    error: (title: string, description?: string) => void;
    warning: (title: string, description?: string) => void;
    info: (title: string, description?: string) => void;
}

// ===== Context =====

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
};

// ===== Config =====

const toastConfig: Record<ToastType, { icon: typeof CheckCircle2; color: string; bg: string; border: string }> = {
    success: {
        icon: CheckCircle2,
        color: 'text-status-success',
        bg: 'bg-status-success/10',
        border: 'border-status-success/30',
    },
    error: {
        icon: XCircle,
        color: 'text-status-critical',
        bg: 'bg-status-critical/10',
        border: 'border-status-critical/30',
    },
    warning: {
        icon: AlertTriangle,
        color: 'text-status-warning',
        bg: 'bg-status-warning/10',
        border: 'border-status-warning/30',
    },
    info: {
        icon: Info,
        color: 'text-accent-primary',
        bg: 'bg-accent-primary/10',
        border: 'border-accent-primary/30',
    },
};

// ===== Toast Item =====

const ToastItem = ({ toast, onRemove }: { toast: Toast; onRemove: () => void }) => {
    const config = toastConfig[toast.type];
    const Icon = config.icon;

    useEffect(() => {
        const timer = setTimeout(onRemove, toast.duration || 4000);
        return () => clearTimeout(timer);
    }, [toast.duration, onRemove]);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn(
                'relative flex items-start gap-3 p-4 rounded-xl border backdrop-blur-xl',
                'bg-panel-bg/95 shadow-[var(--panel-shadow)]',
                'min-w-[320px] max-w-[420px]',
                config.border
            )}
        >
            {/* Icon */}
            <div className={cn('flex-shrink-0 mt-0.5', config.color)}>
                <Icon size={20} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary">
                    {toast.title}
                </p>
                {toast.description && (
                    <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                        {toast.description}
                    </p>
                )}
            </div>

            {/* Close button */}
            <button
                onClick={onRemove}
                className="flex-shrink-0 p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-primary/50 transition-all"
            >
                <X size={14} />
            </button>

            {/* Progress bar */}
            <motion.div
                className={cn('absolute bottom-0 left-0 h-[2px] rounded-full', config.bg.replace('/10', ''))}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: (toast.duration || 4000) / 1000, ease: 'linear' }}
            />
        </motion.div>
    );
};

// ===== Toast Container =====

const ToastContainer = ({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) => {
    return (
        <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2">
            <AnimatePresence mode="popLayout">
                {toasts.map((toast) => (
                    <ToastItem
                        key={toast.id}
                        toast={toast}
                        onRemove={() => removeToast(toast.id)}
                    />
                ))}
            </AnimatePresence>
        </div>
    );
};

// ===== Provider =====

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { ...toast, id }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const success = useCallback((title: string, description?: string) => {
        addToast({ type: 'success', title, description });
    }, [addToast]);

    const error = useCallback((title: string, description?: string) => {
        addToast({ type: 'error', title, description });
    }, [addToast]);

    const warning = useCallback((title: string, description?: string) => {
        addToast({ type: 'warning', title, description });
    }, [addToast]);

    const info = useCallback((title: string, description?: string) => {
        addToast({ type: 'info', title, description });
    }, [addToast]);

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    );
};

export default ToastProvider;
