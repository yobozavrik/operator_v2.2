/**
 * UX Design System Tokens
 * Based on provided Figma-style wireframes and UX specs.
 */

export const UI_TOKENS = {
    colors: {
        background: '#0A1931', // Deep Navy
        panel: '#112240',      // Midnight Blue
        border: '#1A3D63',     // Deep Sea Border
        foreground: '#F6FAFD', // Ice White
        muted: '#B3CFE5',      // Periwinkle
        accent: '#4A7FA7',     // Ocean Blue

        priority: {
            critical: '#EF4444', // Red
            high: '#F59E0B',     // Amber
            reserve: '#64FFDA',  // Cyan/Teal (Pop)
            normal: '#10B981',   // Emerald
        }
    },
    brand: {
        primary: '#4A7FA7',  // Ocean Blue
        secondary: '#64FFDA' // Cyan
    },

    radius: {
        panel: '16px', // Slightly more rounded for organic feel
        component: '10px',
    },
    typography: {
        headingXL: '26px',
        headingL: '20px',
        body: '13px',
        label: '11px',
    },
    // Canonical fonts — only these two should be used globally.
    // Geist: body text, UI labels, headings.
    // JetBrains Mono: numbers, codes, monospace labels.
    // Access via CSS vars: var(--font-geist-sans), var(--font-jetbrains)
    fonts: {
        sans: 'var(--font-geist-sans)',
        mono: 'var(--font-jetbrains)',
    },
} as const;
