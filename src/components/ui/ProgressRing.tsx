'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// ===== Types =====

interface ProgressRingProps {
    /** Progress value (0-100) */
    value: number;
    /** Maximum value for calculation (default 100) */
    max?: number;
    /** Ring size in pixels */
    size?: number;
    /** Stroke width */
    strokeWidth?: number;
    /** Color theme */
    color?: 'cyan' | 'green' | 'amber' | 'red' | 'gradient';
    /** Show percentage text */
    showValue?: boolean;
    /** Custom label instead of percentage */
    label?: string;
    /** Secondary label (below main) */
    sublabel?: string;
    /** Animation duration in seconds */
    duration?: number;
    /** Additional className */
    className?: string;
}

// ===== Config =====

const colorConfig = {
    cyan: {
        stroke: '#00D4FF',
        glow: 'drop-shadow(0 0 8px rgba(0, 212, 255, 0.5))',
        text: 'text-[#00D4FF]',
    },
    green: {
        stroke: '#10B981',
        glow: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.5))',
        text: 'text-[#10B981]',
    },
    amber: {
        stroke: '#F59E0B',
        glow: 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.5))',
        text: 'text-[#F59E0B]',
    },
    red: {
        stroke: '#EF4444',
        glow: 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.5))',
        text: 'text-[#EF4444]',
    },
    gradient: {
        stroke: 'url(#progress-gradient)',
        glow: 'drop-shadow(0 0 8px rgba(0, 212, 255, 0.4))',
        text: 'text-[#00D4FF]',
    },
};

// ===== Component =====

export const ProgressRing = ({
    value,
    max = 100,
    size = 120,
    strokeWidth = 8,
    color = 'cyan',
    showValue = true,
    label,
    sublabel,
    duration = 1,
    className,
}: ProgressRingProps) => {
    const normalizedValue = Math.min(Math.max((value / max) * 100, 0), 100);
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (normalizedValue / 100) * circumference;

    const colors = colorConfig[color];

    // Determine color based on value if not specified
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const getAutoColor = () => {
        if (normalizedValue >= 80) return colorConfig.green;
        if (normalizedValue >= 50) return colorConfig.amber;
        return colorConfig.red;
    };

    const activeColors = color === 'gradient' ? colors : colors;

    return (
        <div className={cn('relative inline-flex items-center justify-center', className)}>
            <svg
                width={size}
                height={size}
                className="transform -rotate-90"
                style={{ filter: activeColors.glow }}
            >
                {/* Gradient definition */}
                <defs>
                    <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#00D4FF" />
                        <stop offset="50%" stopColor="#0088FF" />
                        <stop offset="100%" stopColor="#00D4FF" />
                    </linearGradient>
                </defs>

                {/* Background circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth={strokeWidth}
                />

                {/* Progress circle */}
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={activeColors.stroke}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset }}
                    transition={{ duration, ease: 'easeOut' }}
                />
            </svg>

            {/* Center content */}
            {(showValue || label) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <motion.span
                        className={cn('font-black', activeColors.text)}
                        style={{ fontSize: size * 0.22 }}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: duration * 0.5, duration: 0.3 }}
                    >
                        {label || `${Math.round(normalizedValue)}%`}
                    </motion.span>
                    {sublabel && (
                        <span
                            className="text-white/40 font-medium"
                            style={{ fontSize: size * 0.1 }}
                        >
                            {sublabel}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

// ===== Progress Ring with Label =====

interface ProgressRingCardProps extends ProgressRingProps {
    title: string;
    description?: string;
}

export const ProgressRingCard = ({
    title,
    description,
    ...ringProps
}: ProgressRingCardProps) => {
    return (
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col items-center gap-4 hover:bg-white/[0.04] transition-colors">
            <ProgressRing {...ringProps} />
            <div className="text-center">
                <p className="text-sm font-bold text-white">{title}</p>
                {description && (
                    <p className="text-xs text-white/40 mt-1">{description}</p>
                )}
            </div>
        </div>
    );
};

// ===== Mini Progress Ring (for inline use) =====

interface MiniProgressProps {
    value: number;
    max?: number;
    size?: number;
    color?: 'cyan' | 'green' | 'amber' | 'red';
}

export const MiniProgress = ({
    value,
    max = 100,
    size = 32,
    color = 'cyan',
}: MiniProgressProps) => {
    return (
        <ProgressRing
            value={value}
            max={max}
            size={size}
            strokeWidth={3}
            color={color}
            showValue={false}
            duration={0.5}
        />
    );
};

// ===== Production Goal Widget =====

interface ProductionGoalProps {
    produced: number;
    target: number;
    unit?: string;
    title?: string;
    className?: string;
}

export const ProductionGoal = ({
    produced,
    target,
    unit = 'кг',
    title = 'Виконання плану',
    className,
}: ProductionGoalProps) => {
    const percentage = Math.round((produced / target) * 100);
    const color = percentage >= 100 ? 'green' : percentage >= 70 ? 'cyan' : percentage >= 40 ? 'amber' : 'red';

    return (
        <div className={cn(
            'bg-white/[0.02] border border-white/5 rounded-xl p-5',
            'hover:bg-white/[0.04] hover:border-white/10 transition-all',
            className
        )}>
            <div className="flex items-center gap-5">
                <ProgressRing
                    value={produced}
                    max={target}
                    size={90}
                    strokeWidth={6}
                    color={color}
                    label={`${percentage}%`}
                    duration={1.2}
                />
                <div className="flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-2">
                        {title}
                    </p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-white">
                            {produced.toLocaleString()}
                        </span>
                        <span className="text-white/40 font-medium">
                            / {target.toLocaleString()} {unit}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <div className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded',
                            percentage >= 100 ? 'bg-[#10B981]/10 text-[#10B981]' :
                            percentage >= 70 ? 'bg-[#00D4FF]/10 text-[#00D4FF]' :
                            'bg-[#F59E0B]/10 text-[#F59E0B]'
                        )}>
                            {percentage >= 100 ? 'Виконано!' : `Залишилось ${target - produced} ${unit}`}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProgressRing;
