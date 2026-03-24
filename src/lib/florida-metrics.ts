import { normalizeFloridaUnit } from '@/lib/florida-dictionary';

interface NormalizeFloridaMetricsInput {
    stock: unknown;
    min: unknown;
    avg: unknown;
    need: unknown;
    unit?: unknown;
    productName?: string;
}

interface NormalizeFloridaMetricsOutput {
    stock: number;
    min: number;
    avg: number;
    need: number;
    scaledBy1000: boolean;
}

function toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').trim();
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function roundTo(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

function shouldScaleMetricsBy1000(
    stock: number,
    min: number,
    avg: number,
    need: number,
    uiUnit: 'шт' | 'кг'
): boolean {
    const huge = min >= 1000 || avg >= 1000 || need >= 1000;
    if (!huge) return false;

    const ratio = avg > 0 ? min / avg : 0;
    const ratioLooksLikePolicy = ratio >= 1.4 && ratio <= 1.6;
    const minFarAboveStock = min > Math.max(50, stock * 20);
    const looksScaled = ratioLooksLikePolicy || minFarAboveStock;

    if (uiUnit === 'кг') return looksScaled;

    // Fallback: when unit resolution fails, still fix obvious x1000 data.
    // Require both signals to avoid over-scaling true piece-based products.
    return ratioLooksLikePolicy && minFarAboveStock;
}

/**
 * Florida-specific normalization:
 * - clamps negative stock to 0
 * - rescales min/avg/need by 1000 when view returns gram-like values for kg products
 * - recomputes need from min - stock to keep metrics consistent
 */
export function normalizeFloridaMetrics(input: NormalizeFloridaMetricsInput): NormalizeFloridaMetricsOutput {
    const rawStock = toNumber(input.stock);
    const rawMin = Math.max(0, toNumber(input.min));
    const rawAvg = Math.max(0, toNumber(input.avg));
    const rawNeed = Math.max(0, toNumber(input.need));

    const stock = Math.max(0, rawStock);
    const uiUnit = normalizeFloridaUnit(input.unit, input.productName || '');
    const scaledBy1000 = shouldScaleMetricsBy1000(stock, rawMin, rawAvg, rawNeed, uiUnit);
    const divisor = scaledBy1000 ? 1000 : 1;

    const min = roundTo(Math.max(0, rawMin / divisor), 3);
    const avg = roundTo(Math.max(0, rawAvg / divisor), 3);
    const need = roundTo(Math.max(0, min - stock), 3);

    return { stock, min, avg, need, scaledBy1000 };
}
