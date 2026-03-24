'use client';

import React from 'react';
import { cn } from '@/lib/utils';

// ===== Base Skeleton =====

interface SkeletonProps {
    className?: string;
    /** Animation style */
    animation?: 'pulse' | 'shimmer' | 'none';
    /** Custom inline styles */
    style?: React.CSSProperties;
}

export const Skeleton = ({ className, animation = 'shimmer', style }: SkeletonProps) => {
    return (
        <div
            className={cn(
                'bg-white/5 rounded-lg',
                animation === 'pulse' && 'animate-pulse',
                animation === 'shimmer' && 'relative overflow-hidden',
                className
            )}
            style={style}
        >
            {animation === 'shimmer' && (
                <div
                    className="absolute inset-0 -translate-x-full"
                    style={{
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
                        animation: 'shimmer 1.5s infinite',
                    }}
                />
            )}
        </div>
    );
};

// ===== Skeleton Text =====

interface SkeletonTextProps {
    lines?: number;
    className?: string;
    lastLineWidth?: string;
}

export const SkeletonText = ({ lines = 3, className, lastLineWidth = '60%' }: SkeletonTextProps) => {
    return (
        <div className={cn('space-y-2', className)}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    className="h-4"
                    style={{ width: i === lines - 1 ? lastLineWidth : '100%' } as React.CSSProperties}
                />
            ))}
        </div>
    );
};

// ===== Skeleton Card =====

export const SkeletonCard = ({ className }: { className?: string }) => {
    return (
        <div className={cn(
            'bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4',
            className
        )}>
            <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            </div>
            <SkeletonText lines={2} />
        </div>
    );
};

// ===== Skeleton Table =====

interface SkeletonTableProps {
    rows?: number;
    columns?: number;
    className?: string;
}

export const SkeletonTable = ({ rows = 5, columns = 4, className }: SkeletonTableProps) => {
    return (
        <div className={cn('bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden', className)}>
            {/* Header */}
            <div className="flex gap-4 p-4 bg-white/[0.02] border-b border-white/5">
                {Array.from({ length: columns }).map((_, i) => (
                    <Skeleton key={i} className="h-4 flex-1" />
                ))}
            </div>
            {/* Rows */}
            <div className="divide-y divide-white/[0.03]">
                {Array.from({ length: rows }).map((_, rowIndex) => (
                    <div key={rowIndex} className="flex gap-4 p-4">
                        {Array.from({ length: columns }).map((_, colIndex) => (
                            <Skeleton
                                key={colIndex}
                                className="h-4 flex-1"
                                style={{ animationDelay: `${(rowIndex * columns + colIndex) * 50}ms` } as React.CSSProperties}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
};

// ===== Skeleton KPI Card =====

export const SkeletonKPI = ({ className }: { className?: string }) => {
    return (
        <div className={cn(
            'bg-white/[0.02] border border-white/5 rounded-xl p-5 space-y-4',
            className
        )}>
            <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="w-8 h-8 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-24" />
            <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-3 w-16" />
            </div>
        </div>
    );
};

// ===== Skeleton Product Card =====

export const SkeletonProductCard = ({ className }: { className?: string }) => {
    return (
        <div className={cn(
            'bg-white/[0.02] border border-white/5 rounded-xl p-4',
            className
        )}>
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Skeleton className="w-6 h-6 rounded" />
                    <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-1">
                        <Skeleton className="h-3 w-12" />
                        <Skeleton className="h-5 w-8" />
                    </div>
                ))}
            </div>
        </div>
    );
};

// ===== Skeleton Chart =====

export const SkeletonChart = ({ className }: { className?: string }) => {
    return (
        <div className={cn(
            'bg-white/[0.02] border border-white/5 rounded-xl p-5',
            className
        )}>
            <div className="flex items-center justify-between mb-6">
                <Skeleton className="h-5 w-32" />
                <div className="flex gap-2">
                    <Skeleton className="h-6 w-16 rounded-lg" />
                    <Skeleton className="h-6 w-16 rounded-lg" />
                </div>
            </div>
            <div className="flex items-end gap-2 h-48">
                {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton
                        key={i}
                        className="flex-1 rounded-t-lg"
                        style={{
                            height: `${Math.random() * 60 + 20}%`,
                            animationDelay: `${i * 100}ms`
                        } as React.CSSProperties}
                    />
                ))}
            </div>
        </div>
    );
};

// ===== Skeleton Grid =====

interface SkeletonGridProps {
    count?: number;
    columns?: number;
    ItemComponent?: React.ComponentType<{ className?: string }>;
    className?: string;
}

export const SkeletonGrid = ({
    count = 6,
    columns = 3,
    ItemComponent = SkeletonCard,
    className
}: SkeletonGridProps) => {
    return (
        <div
            className={cn('grid gap-4', className)}
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
            {Array.from({ length: count }).map((_, i) => (
                <ItemComponent key={i} />
            ))}
        </div>
    );
};

// Add shimmer keyframes to global styles
const shimmerStyles = `
@keyframes shimmer {
    100% {
        transform: translateX(100%);
    }
}
`;

// Inject styles once
if (typeof document !== 'undefined') {
    const styleId = 'skeleton-shimmer-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = shimmerStyles;
        document.head.appendChild(style);
    }
}

export default Skeleton;
