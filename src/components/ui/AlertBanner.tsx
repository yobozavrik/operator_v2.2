'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, XCircle, Info, CheckCircle2, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ===== Types =====

type AlertType = 'critical' | 'warning' | 'info' | 'success';

interface AlertBannerProps {
    /** Alert type */
    type: AlertType;
    /** Main message */
    title: string;
    /** Optional description */
    description?: string;
    /** Show pulsing animation for critical alerts */
    pulse?: boolean;
    /** Show dismiss button */
    dismissible?: boolean;
    /** On dismiss callback */
    onDismiss?: () => void;
    /** Action button */
    action?: {
        label: string;
        onClick: () => void;
    };
    /** Visibility control */
    visible?: boolean;
    /** Additional className */
    className?: string;
}

// ===== Config =====

const alertConfig = {
    critical: {
        icon: XCircle,
        bg: 'bg-status-critical/10',
        border: 'border-status-critical/40',
        iconColor: 'text-status-critical',
        titleColor: 'text-status-critical',
        pulse: 'animate-pulse',
        glow: 'shadow-[0_0_20px_rgba(var(--color-status-critical),0.2)]',
    },
    warning: {
        icon: AlertTriangle,
        bg: 'bg-status-warning/10',
        border: 'border-status-warning/40',
        iconColor: 'text-status-warning',
        titleColor: 'text-status-warning',
        pulse: '',
        glow: '',
    },
    info: {
        icon: Info,
        bg: 'bg-accent-primary/10',
        border: 'border-accent-primary/40',
        iconColor: 'text-accent-primary',
        titleColor: 'text-accent-primary',
        pulse: '',
        glow: '',
    },
    success: {
        icon: CheckCircle2,
        bg: 'bg-status-success/10',
        border: 'border-status-success/40',
        iconColor: 'text-status-success',
        titleColor: 'text-status-success',
        pulse: '',
        glow: '',
    },
};

// ===== Component =====

export const AlertBanner = ({
    type,
    title,
    description,
    pulse = false,
    dismissible = false,
    onDismiss,
    action,
    visible = true,
    className,
}: AlertBannerProps) => {
    const config = alertConfig[type];
    const Icon = config.icon;

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -10, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                        'relative rounded-xl border p-4',
                        config.bg,
                        config.border,
                        type === 'critical' && pulse && config.glow,
                        className
                    )}
                >
                    <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className={cn(
                            'flex-shrink-0 mt-0.5',
                            config.iconColor,
                            type === 'critical' && pulse && config.pulse
                        )}>
                            <Icon size={20} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <p className={cn('text-sm font-bold', config.titleColor)}>
                                {title}
                            </p>
                            {description && (
                                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                                    {description}
                                </p>
                            )}
                            {action && (
                                <button
                                    onClick={action.onClick}
                                    className={cn(
                                        'mt-3 inline-flex items-center gap-1 text-xs font-bold',
                                        'px-3 py-1.5 rounded-lg',
                                        'bg-panel-border/30 hover:bg-panel-border/50',
                                        'text-text-primary transition-colors',
                                    )}
                                >
                                    {action.label}
                                    <ChevronRight size={12} />
                                </button>
                            )}
                        </div>

                        {/* Dismiss button */}
                        {dismissible && (
                            <button
                                onClick={onDismiss}
                                className="flex-shrink-0 p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-panel-border/30 transition-all"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {/* Pulsing border effect for critical */}
                    {type === 'critical' && pulse && (
                        <div className="absolute inset-0 rounded-xl border border-status-critical/50 animate-ping pointer-events-none" />
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// ===== Inline Alert (smaller, for forms/sections) =====

interface InlineAlertProps {
    type: AlertType;
    message: string;
    className?: string;
}

export const InlineAlert = ({ type, message, className }: InlineAlertProps) => {
    const config = alertConfig[type];
    const Icon = config.icon;

    return (
        <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
            config.bg,
            className
        )}>
            <Icon size={14} className={config.iconColor} />
            <span className="text-white/80">{message}</span>
        </div>
    );
};

// ===== Critical Counter (for showing number of critical items) =====

interface CriticalCounterProps {
    count: number;
    label?: string;
    onClick?: () => void;
    className?: string;
}

export const CriticalCounter = ({
    count,
    label = 'критичних',
    onClick,
    className,
}: CriticalCounterProps) => {
    if (count === 0) return null;

    return (
        <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-xl',
                'bg-[#EF4444]/20 border border-[#EF4444]/40',
                'text-[#EF4444] font-bold text-sm',
                'hover:bg-[#EF4444]/30 transition-colors',
                'shadow-[0_0_15px_rgba(239,68,68,0.2)]',
                className
            )}
        >
            <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EF4444] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#EF4444]" />
            </span>
            <span>{count} {label}</span>
        </motion.button>
    );
};

// ===== Status Dot (for table cells, lists) =====

interface StatusDotProps {
    status: 'critical' | 'warning' | 'normal' | 'good';
    pulse?: boolean;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export const StatusDot = ({
    status,
    pulse = false,
    size = 'md',
    className,
}: StatusDotProps) => {
    const statusColors = {
        critical: 'bg-[#EF4444]',
        warning: 'bg-[#F59E0B]',
        normal: 'bg-[#00D4FF]',
        good: 'bg-[#10B981]',
    };

    const sizes = {
        sm: 'h-2 w-2',
        md: 'h-2.5 w-2.5',
        lg: 'h-3 w-3',
    };

    return (
        <span className={cn('relative inline-flex', sizes[size], className)}>
            {pulse && (status === 'critical' || status === 'warning') && (
                <span className={cn(
                    'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                    statusColors[status]
                )} />
            )}
            <span className={cn(
                'relative inline-flex rounded-full h-full w-full',
                statusColors[status]
            )} />
        </span>
    );
};

export default AlertBanner;
