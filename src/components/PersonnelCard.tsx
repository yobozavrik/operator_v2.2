'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Users, Crown, User, Snowflake } from 'lucide-react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { SHIFTS, PRODUCTION_NORM_PER_PERSON, getShiftCapacity, getCurrentShift, Shift, Employee } from '@/lib/personnel';
import { cn } from '@/lib/utils';

interface Props {
    className?: string;
    isActive?: boolean;
    onSelect?: () => void;
}

const getPositionIcon = (position: Employee['position']) => {
    switch (position) {
        case 'Старший смени':
            return <Crown size={12} className="text-[#FFD700]" />;
        case 'Шокер':
            return <Snowflake size={12} className="text-[#00BCF2]" />;
        default:
            return <User size={12} className="text-gray-400" />;
    }
};

export const PersonnelCard = ({ className, isActive = false, onSelect }: Props) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [expandedShift, setExpandedShift] = useState<number | null>(null);

    const currentShift = getCurrentShift();
    const totalCapacity = SHIFTS.reduce((sum, s) => sum + getShiftCapacity(s), 0);
    const totalEmployees = SHIFTS.reduce((sum, s) => sum + s.employees.length, 0);

    const toggleShift = (shiftId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedShift(prev => prev === shiftId ? null : shiftId);
    };

    return (
        <div className={cn("", className)}>
            {/* Main Personnel Button - like store button */}
            <button
                onClick={() => {
                    onSelect?.();
                    setIsExpanded(!isExpanded);
                }}
                className={cn(
                    "w-full px-4 py-3.5 text-left rounded-xl transition-all duration-300 relative overflow-hidden group",
                    (isExpanded || isActive) && "scale-[1.02]"
                )}
                style={{
                    background: (isExpanded || isActive)
                        ? 'rgba(0, 212, 255, 0.1)'
                        : 'rgba(20, 27, 45, 0.7)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: (isExpanded || isActive)
                        ? '1px solid rgba(0, 212, 255, 0.5)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: (isExpanded || isActive)
                        ? '0 0 30px rgba(0, 212, 255, 0.3), 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                        : '0 4px 16px rgba(0, 0, 0, 0.2)',
                }}
            >
                {/* Shimmer effect on hover */}
                <div
                    className={cn(
                        "absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full transition-transform duration-700 group-hover:translate-x-full"
                    )}
                />

                {/* Active glow indicator */}
                {(isExpanded || isActive) && (
                    <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                        style={{
                            background: 'linear-gradient(180deg, #00D4FF 0%, #0088FF 100%)',
                            boxShadow: '0 0 12px rgba(0, 212, 255, 0.8)',
                        }}
                    />
                )}

                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, #00D4FF 0%, #0088FF 100%)',
                                boxShadow: '0 0 12px rgba(0, 212, 255, 0.4)',
                            }}
                        >
                            <Users size={16} className="text-white" />
                        </div>
                        <div>
                            <span
                                className={cn(
                                    "text-[12px] font-semibold uppercase tracking-wide transition-all duration-300",
                                    (isExpanded || isActive) ? "text-[#00D4FF]" : "text-gray-400"
                                )}
                            >
                                Персонал
                            </span>
                            <div className="text-[9px] text-gray-500">
                                {totalEmployees} осіб • ~{totalCapacity} кг/день
                            </div>
                        </div>
                    </div>
                    {isExpanded ?
                        <ChevronDown size={16} className="text-[#00D4FF]" /> :
                        <ChevronRight size={16} className="text-gray-400" />
                    }
                </div>
            </button>

            {/* Expanded: Shifts (like categories) */}
            {isExpanded && (
                <div className="mt-2 space-y-1.5 ml-2">
                    {SHIFTS.map((shift) => {
                        const isShiftExpanded = expandedShift === shift.id;
                        const isCurrent = currentShift?.id === shift.id;
                        const capacity = getShiftCapacity(shift);

                        return (
                            <div key={shift.id}>
                                {/* Shift row (like category row) */}
                                <button
                                    onClick={(e) => toggleShift(shift.id, e)}
                                    className="w-full px-4 py-2.5 rounded-lg hover:bg-[#2a2f4a] flex items-center justify-between transition-all duration-200"
                                    style={{
                                        background: isShiftExpanded ? 'rgba(42, 47, 74, 0.8)' : 'transparent',
                                    }}
                                >
                                    <div className="flex items-center gap-2">
                                        {isShiftExpanded ?
                                            <ChevronDown size={14} className="text-[var(--text-muted)]" /> :
                                            <ChevronRight size={14} className="text-[var(--text-muted)]" />
                                        }
                                        <span className="text-[11px] font-bold text-[var(--foreground)]">
                                            {shift.name}
                                        </span>
                                        {isCurrent && (
                                            <span className="px-1.5 py-0.5 rounded text-[7px] font-bold bg-[#00D4FF]/20 text-[#00D4FF] uppercase">
                                                Зараз
                                            </span>
                                        )}
                                        <span className="text-[9px] text-[var(--text-muted)]">
                                            ({shift.employees.length} осіб)
                                        </span>
                                    </div>
                                    <span className="text-[11px] font-bold text-[#52E8FF]">
                                        ~{capacity} кг
                                    </span>
                                </button>

                                {/* Employees (like products) */}
                                {isShiftExpanded && (
                                    <div className="ml-6 mt-1 space-y-0.5 border-l border-[var(--border)]/30 pl-3">
                                        {shift.employees.map((employee) => (
                                            <div
                                                key={employee.id}
                                                className="px-3 py-1.5 rounded-md flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                                            >
                                                <div className="flex items-center gap-2">
                                                    {getPositionIcon(employee.position)}
                                                    <span className={cn(
                                                        "text-[10px]",
                                                        employee.isLeader ? "font-bold text-[#FFD700]" : "text-gray-300"
                                                    )}>
                                                        {employee.name}
                                                    </span>
                                                </div>
                                                <span className="text-[8px] text-gray-500 uppercase">
                                                    {employee.position === 'Старший смени' ? '👑' :
                                                        employee.position === 'Шокер' ? '🧊' : ''}
                                                </span>
                                            </div>
                                        ))}

                                        {/* Shift summary */}
                                        <div className="mt-2 pt-2 border-t border-white/5 px-3">
                                            <div className="flex items-center justify-between text-[9px]">
                                                <span className="text-gray-500">Старша: {shift.leader}</span>
                                                <span className="text-[#00D4FF] font-bold">
                                                    {PRODUCTION_NORM_PER_PERSON} кг/особа
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
