'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Database, CloudSync, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SyncOverlayProps {
    isVisible: boolean;
    onFinished?: () => void;
}

const SYNC_STEPS = [
    { icon: Database, text: 'З’єднуємося з базою даних...', color: '#00D4FF' },
    { icon: CloudSync, text: 'Оновлюємо залишки SKU...', color: '#58A6FF' },
    { icon: RefreshCw, text: 'Перераховуємо дефіцит...', color: '#3FB950' },
    { icon: CheckCircle2, text: 'Готово! Оновлюємо інтерфейс...', color: '#2EA043' },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const SyncOverlay = ({ isVisible, onFinished }: SyncOverlayProps) => {
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        if (isVisible) {
            setCurrentStep(0);
            const interval = setInterval(() => {
                setCurrentStep((prev) => (prev < SYNC_STEPS.length - 1 ? prev + 1 : prev));
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [isVisible]);

    const ActiveIcon = SYNC_STEPS[currentStep].icon;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
                >
                    {/* Backdrop with high blur */}
                    <div className="absolute inset-0 bg-[#0A0E1A]/80 backdrop-blur-xl" />

                    {/* Content Container */}
                    <div className="relative z-10 flex flex-col items-center">
                        {/* Recursive Animated Rings */}
                        <div className="relative w-48 h-48 flex items-center justify-center">
                            {[0, 1, 2].map((i) => (
                                <motion.div
                                    key={i}
                                    className="absolute inset-0 rounded-full border border-[#00D4FF]/20"
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{
                                        scale: [0.8, 1.5],
                                        opacity: [0.5, 0],
                                    }}
                                    transition={{
                                        duration: 2,
                                        repeat: Infinity,
                                        delay: i * 0.6,
                                        ease: "easeOut"
                                    }}
                                />
                            ))}

                            {/* Main Rotating Hexagon/Orb */}
                            <motion.div
                                className="relative w-24 h-24 bg-gradient-to-br from-[#00D4FF] to-[#0088FF] rounded-3xl flex items-center justify-center shadow-[0_0_50px_rgba(0,212,255,0.4)]"
                                animate={{
                                    rotate: 360,
                                    borderRadius: ["24px", "40px", "24px"]
                                }}
                                transition={{
                                    rotate: { duration: 10, repeat: Infinity, ease: "linear" },
                                    borderRadius: { duration: 2, repeat: Infinity, ease: "easeInOut" }
                                }}
                            >
                                <motion.div
                                    key={currentStep}
                                    initial={{ scale: 0, rotate: -180 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    className="text-white"
                                >
                                    <ActiveIcon size={40} strokeWidth={2.5} />
                                </motion.div>
                            </motion.div>

                            {/* Orbiting particles */}
                            <motion.div
                                className="absolute inset-0"
                                animate={{ rotate: -360 }}
                                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                            >
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#52E8FF] rounded-full shadow-[0_0_15px_#52E8FF] animate-pulse" />
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#3FB950] rounded-full shadow-[0_0_10px_#3FB950]" />
                            </motion.div>
                        </div>

                        {/* Status Text Area */}
                        <div className="mt-12 text-center max-w-xs">
                            <motion.h2
                                className="text-[14px] font-black text-white uppercase tracking-[0.2em] mb-4"
                                animate={{ opacity: [0.5, 1, 0.5] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            >
                                Синхронізація Даних
                            </motion.h2>

                            <div className="h-6 relative">
                                <AnimatePresence mode="wait">
                                    <motion.p
                                        key={currentStep}
                                        initial={{ y: 10, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        exit={{ y: -10, opacity: 0 }}
                                        className="text-[16px] font-bold text-[#52E8FF] tracking-tight"
                                    >
                                        {SYNC_STEPS[currentStep].text}
                                    </motion.p>
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Progress Indicator */}
                        <div className="mt-10 flex gap-2">
                            {SYNC_STEPS.map((_, i) => (
                                <motion.div
                                    key={i}
                                    className={cn(
                                        "h-1 rounded-full transition-all duration-500",
                                        i <= currentStep ? "w-8 bg-[#00D4FF]" : "w-4 bg-white/10"
                                    )}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Decorative Background Elements */}
                    <div className="absolute top-1/4 -left-20 w-80 h-80 bg-[#00D4FF]/5 rounded-full blur-[100px]" />
                    <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-[#58A6FF]/5 rounded-full blur-[100px]" />
                </motion.div>
            )}
        </AnimatePresence>
    );
};
