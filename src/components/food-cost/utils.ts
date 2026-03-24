export function fmt(n: number): string {
    return new Intl.NumberFormat('uk-UA').format(Math.round(n));
}

export function fmtK(n: number): string {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)} тис.`;
    return fmt(n);
}

export function delta(val: number, unit = '%', invert = false) {
    if (Math.abs(val) < 0.05) return null;
    const positive = invert ? val < 0 : val > 0;
    return { positive, label: `${val > 0 ? '↑' : '↓'} ${Math.abs(val).toFixed(1)}${unit}` };
}
