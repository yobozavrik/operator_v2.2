"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    // Prevent hydration mismatch
    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="w-10 h-10 rounded-xl bg-panel-bg border border-panel-border opacity-50" />;
    }

    const isDark = resolvedTheme === "dark";

    return (
        <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={cn(
                "relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300",
                "bg-panel-bg border border-panel-border text-text-muted hover:text-accent-primary",
                isDark ? "hover:border-accent-primary/50 hover:shadow-[0_0_15px_rgba(0,212,255,0.2)]" : "hover:border-accent-primary/30"
            )}
            title={isDark ? "Увімкнути світлу тему" : "Увімкнути темну тему"}
        >
            <Sun
                size={18}
                className={cn(
                    "absolute transition-all duration-300",
                    isDark ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"
                )}
            />
            <Moon
                size={18}
                className={cn(
                    "absolute transition-all duration-300",
                    isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"
                )}
            />
        </button>
    );
}
