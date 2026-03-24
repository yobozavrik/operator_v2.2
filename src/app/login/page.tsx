'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, ChevronRight, Terminal, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils'; // Assuming basic cn utility exists

// Fonts come from global layout: Geist (sans) + JetBrains Mono (--font-jetbrains)

export default function LoginPage() {
    const router = useRouter();
    const supabase = createClient();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                setError('Невірний email або пароль');
                setLoading(false);
                return;
            }

            // Successful login
            router.refresh();
            router.replace('/');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
            setError('Сталася помилка при вході');
            setLoading(false);
        }
    };

    return (
        <div className={cn(
            "min-h-screen flex items-center justify-center overflow-hidden relative transition-colors duration-300",
            "bg-[#F0F4F8] dark:bg-[#0B0F19]",
            "font-sans"
        )}>
            {/* Background Layers */}
            <div className="fixed inset-0 z-0 bg-particles opacity-30 dark:opacity-20 pointer-events-none"></div>
            <div className="fixed inset-0 z-0 bg-gradient-to-b from-transparent via-transparent to-black/80 pointer-events-none"></div>
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#00C3FF]/10 rounded-full blur-[120px] animate-pulse-slow pointer-events-none"></div>
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 rounded-full blur-[120px] pointer-events-none"></div>

            <main className="relative z-10 w-full max-w-md p-6 font-sans">
                <div className="group card-hover relative bg-white/60 dark:bg-[rgba(18,24,38,0.7)] glass-panel rounded-xl border border-gray-200 dark:border-[rgba(0,195,255,0.3)] shadow-glass p-8 md:p-10 transition-all duration-300 backdrop-blur-xl">
                    {/* Corner Brackets */}
                    <div className="corner-bracket corner-tl"></div>
                    <div className="corner-bracket corner-tr"></div>
                    <div className="corner-bracket corner-bl"></div>
                    <div className="corner-bracket corner-br"></div>

                    {/* Header */}
                    <div className="flex flex-col items-center mb-10 animate-float">
                        <div className="w-16 h-16 bg-gradient-to-br from-[#00C3FF] to-blue-600 rounded-lg shadow-neon flex items-center justify-center mb-6 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                            <span className="text-white font-bold text-4xl drop-shadow-md select-none tracking-widest">Г</span>
                        </div>
                        <h1 className="text-center font-bold text-2xl md:text-3xl text-gray-900 dark:text-white tracking-[0.15em] uppercase mb-2 drop-shadow-[0_0_10px_rgba(0,195,255,0.3)]">
                            АНАЛІТИЧНА СИСТЕМА <br /> <span className="text-[#00C3FF]">ГАЛЯ</span>
                        </h1>
                        <div className="flex items-center space-x-2 text-[#00C3FF]/80 dark:text-[#00C3FF]/70">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            <span className="text-xs tracking-[0.2em] uppercase font-[family-name:var(--font-jetbrains)]">Виробничий центр</span>
                        </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Email */}
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Mail className="text-gray-400 group-focus-within:text-[#00C3FF] transition-colors" size={20} />
                            </div>
                            <input
                                className={cn(
                                    "block w-full pl-12 pr-4 py-3.5 bg-gray-100 dark:bg-[rgba(255,255,255,0.08)] border border-gray-300 dark:border-gray-700 rounded-lg",
                                    "text-gray-900 dark:text-gray-100 placeholder-gray-500",
                                    "focus:ring-2 focus:ring-[#00C3FF] focus:border-[#00C3FF] transition-all duration-300 outline-none backdrop-blur-sm shadow-inner",
                                    "font-sans"
                                )}
                                id="email"
                                name="email"
                                placeholder="Введіть email"
                                required
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        {/* Password */}
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Lock className="text-gray-400 group-focus-within:text-[#00C3FF] transition-colors" size={20} />
                            </div>
                            <input
                                className={cn(
                                    "block w-full pl-12 pr-12 py-3.5 bg-gray-100 dark:bg-[rgba(255,255,255,0.08)] border border-gray-300 dark:border-gray-700 rounded-lg",
                                    "text-gray-900 dark:text-gray-100 placeholder-gray-500",
                                    "focus:ring-2 focus:ring-[#00C3FF] focus:border-[#00C3FF] transition-all duration-300 outline-none backdrop-blur-sm shadow-inner tracking-widest",
                                    "font-[family-name:var(--font-jetbrains)]"
                                )}
                                id="password"
                                name="password"
                                placeholder="••••••••"
                                required
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <div
                                className="absolute inset-y-0 right-0 pr-4 flex items-center cursor-pointer hover:text-[#00C3FF] text-gray-400 transition-colors"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </div>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="text-red-500 text-sm text-center bg-red-500/10 border border-red-500/20 p-3 rounded-lg animate-in fade-in slide-in-from-bottom-2">
                                {error}
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            className={cn(
                                "w-full relative overflow-hidden rounded-lg btn-scan py-4 px-6 text-white font-bold text-lg tracking-[0.12em] uppercase shadow-neon group transform active:scale-[0.98] transition-transform flex items-center justify-center",
                                loading && "opacity-70 cursor-not-allowed"
                            )}
                            type="submit"
                            disabled={loading}
                        >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                {loading ? "Вхід..." : "Увійти в систему"}
                                {!loading && <ChevronRight className="group-hover:translate-x-1 transition-transform" size={18} />}
                            </span>
                        </button>

                        <div className="text-center pt-2">
                            <a className="text-sm text-gray-500 dark:text-gray-400 hover:text-[#00C3FF] dark:hover:text-[#00C3FF] transition-colors duration-200" href="#">
                                Забули пароль?
                            </a>
                        </div>
                    </form>
                </div>

                <div className="mt-8 text-center flex flex-col gap-2 pointer-events-none">
                    <p className={cn("text-[10px] text-gray-500 dark:text-gray-500/60 uppercase tracking-widest whitespace-nowrap", "font-[family-name:var(--font-jetbrains)]")}>
                        © 2026 Аналітична система Галя. Всі права захищено.
                    </p>
                    <p className={cn("text-[10px] text-[#00C3FF]/60 hover:text-[#00C3FF] uppercase tracking-widest transition-colors cursor-default whitespace-nowrap pointer-events-auto", "font-[family-name:var(--font-jetbrains)]")}>
                        Розроблено Товстицьким Дмитром
                    </p>
                </div>
            </main>

            {/* Bottom Status Indicators */}
            <div className={cn("fixed bottom-6 left-6 hidden md:flex items-center gap-2 opacity-60 text-[10px] text-green-500 select-none", "font-[family-name:var(--font-jetbrains)]")}>
                <Terminal size={14} className="animate-pulse" />
                <span className="typing-effect">СИСТЕМА ГОТОВА</span>
            </div>

            <div className={cn("fixed bottom-6 right-6 hidden md:flex items-center gap-2 opacity-60 text-[10px] text-[#00C3FF] select-none", "font-[family-name:var(--font-jetbrains)]")}>
                <span>ШИФРУВАННЯ АКТИВНЕ</span>
                <ShieldCheck size={14} />
            </div>
        </div>
    );
}
