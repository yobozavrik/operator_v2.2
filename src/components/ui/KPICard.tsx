'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ===== Types =====

interface KPICardProps {
    /** Card title/label */
    title: string;
    /** Main value to display */
    value: string | number;
    /** Optional unit (кг, шт, %) */
    unit?: string;
    /** Trend percentage (+12.5, -3.2, 0) */
    trend?: number;
    /** Trend comparison text */
    trendLabel?: string;
    /** Icon to display */
    icon?: LucideIcon;
    /** Accent color */
    color?: 'cyan' | 'green' | 'amber' | 'red' | 'purple';
    /** Size variant */
    size?: 'sm' | 'md' | 'lg';
    /** Additional className */
    className?: string;
    /** Click handler */
    onClick?: () => void;
}

// ===== Config =====

const colorConfig = {
    cyan: {
        icon: 'bg-accent-primary/10 text-accent-primary',
        value: 'text-accent-primary',
        trendUp: 'text-status-success bg-status-success/10',
        trendDown: 'text-status-critical bg-status-critical/10',
        glow: 'hover:shadow-[0_0_15px_rgba(var(--color-accent-primary),0.1)]',
    },
    green: {
        icon: 'bg-status-success/10 text-status-success',
        value: 'text-status-success',
        trendUp: 'text-status-success bg-status-success/10',
        trendDown: 'text-status-critical bg-status-critical/10',
        glow: 'hover:shadow-[0_0_15px_rgba(var(--color-status-success),0.1)]',
    },
    amber: {
        icon: 'bg-status-warning/10 text-status-warning',
        value: 'text-status-warning',
        trendUp: 'text-status-success bg-status-success/10',
        trendDown: 'text-status-critical bg-status-critical/10',
        glow: 'hover:shadow-[0_0_15px_rgba(var(--color-status-warning),0.1)]',
    },
    red: {
        icon: 'bg-status-critical/10 text-status-critical',
        value: 'text-status-critical',
        trendUp: 'text-status-success bg-status-success/10',
        trendDown: 'text-status-critical bg-status-critical/10',
        glow: 'hover:shadow-[0_0_15px_rgba(var(--color-status-critical),0.1)]',
    },
    purple: {
        icon: 'bg-[#A855F7]/10 text-[#A855F7]',
        value: 'text-[#A855F7]',
        trendUp: 'text-status-success bg-status-success/10',
        trendDown: 'text-status-critical bg-status-critical/10',
        glow: 'hover:shadow-[#A855F7]/10',
    },
};

const sizeConfig = {
    sm: {
        padding: 'p-4',
        iconSize: 'w-8 h-8',
        iconInner: 16,
        valueSize: 'text-xl',
        titleSize: 'text-[10px]',
        trendSize: 'text-[10px] px-1.5 py-0.5',
    },
    md: {
        padding: 'p-5',
        iconSize: 'w-10 h-10',
        iconInner: 20,
        valueSize: 'text-2xl',
        titleSize: 'text-[11px]',
        trendSize: 'text-[11px] px-2 py-1',
    },
    lg: {
        padding: 'p-6',
        iconSize: 'w-12 h-12',
        iconInner: 24,
        valueSize: 'text-3xl',
        titleSize: 'text-xs',
        trendSize: 'text-xs px-2.5 py-1',
    },
};

// ===== Component =====

export const KPICard = ({
    title,
    value,
    unit,
    trend,
    trendLabel = 'vs вчора',
    icon: Icon,
    color = 'cyan',
    size = 'md',
    className,
    onClick,
}: KPICardProps) => {
    const colors = colorConfig[color];
    const sizes = sizeConfig[size];

    const TrendIcon = trend !== undefined
        ? trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus
        : null;

    const trendColor = trend !== undefined
        ? trend > 0 ? colors.trendUp : trend < 0 ? colors.trendDown : 'text-white/40 bg-white/5'
        : '';

    return (
        <motion.div
            whileHover={onClick ? { scale: 1.02, y: -2 } : undefined}
            whileTap={onClick ? { scale: 0.98 } : undefined}
            className={cn(
                'relative bg-panel-bg border border-panel-border rounded-xl',
                'transition-all duration-300',
                'hover:bg-bg-primary/50 hover:border-text-muted',
                'hover:shadow-xl',
                colors.glow,
                sizes.padding,
                onClick && 'cursor-pointer',
                className
            )}
            onClick={onClick}
        >
            {/* Header: Title & Icon */}
            <div className="flex items-center justify-between mb-4">
                <span className={cn(
                    'font-bold uppercase tracking-widest text-text-muted',
                    sizes.titleSize
                )}>
                    {title}
                </span>
                {Icon && (
                    <div className={cn(
                        'rounded-xl flex items-center justify-center',
                        colors.icon,
                        sizes.iconSize
                    )}>
                        <Icon size={sizes.iconInner} />
                    </div>
                )}
            </div>

            {/* Value */}
            <div className="flex items-baseline gap-1.5">
                <motion.span
                    className={cn('font-black', colors.value, sizes.valueSize)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={String(value)}
                >
                    {value}
                </motion.span>
                {unit && (
                    <span className="text-text-muted font-medium text-sm">
                        {unit}
                    </span>
                )}
            </div>

            {/* Trend */}
            {trend !== undefined && (
                <div className="flex items-center gap-2 mt-3">
                    <span className={cn(
                        'inline-flex items-center gap-1 rounded-lg font-bold',
                        trendColor,
                        sizes.trendSize
                    )}>
                        {TrendIcon && <TrendIcon size={12} />}
                        {trend > 0 ? '+' : ''}{trend}%
                    </span>
                    <span className="text-[10px] text-text-secondary">{trendLabel}</span>
                </div>
            )}

            {/* Subtle top glow line */}
            <div
                className="absolute top-0 left-4 right-4 h-[1px] opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                    background: `linear-gradient(90deg, transparent, ${color === 'cyan' ? '#00D4FF' : color === 'green' ? '#10B981' : color === 'amber' ? '#F59E0B' : color === 'red' ? '#EF4444' : '#A855F7'}40, transparent)`,
                }}
            />
        </motion.div>
    );
};

// ===== KPI Grid =====

interface KPIGridProps {
    children: React.ReactNode;
    columns?: 2 | 3 | 4;
    className?: string;
}

export const KPIGrid = ({ children, columns = 4, className }: KPIGridProps) => {
    return (
        <div
            className={cn('grid gap-4', className)}
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
            {children}
        </div>
    );
};

export default KPICard;
