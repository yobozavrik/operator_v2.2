const WAREHOUSE_LABEL = 'Остаток на складе';
const WAREHOUSE_LABEL_MOJIBAKE = 'РѕСЃС‚Р°С‚РѕРє РЅР° СЃРєР»Р°РґРµ';

function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function normalizeComparable(value: string): string {
    return collapseWhitespace(value).toLowerCase();
}

export function isWarehouseSpotName(value: unknown): boolean {
    const normalized = normalizeComparable(String(value || ''));
    return (
        normalized.includes(normalizeComparable(WAREHOUSE_LABEL)) ||
        normalized.includes(normalizeComparable(WAREHOUSE_LABEL_MOJIBAKE)) ||
        normalized.includes('????')
    );
}

export function normalizeDistributionSpotName(value: unknown): string {
    const raw = collapseWhitespace(String(value || ''));
    if (!raw) return '';
    if (isWarehouseSpotName(raw)) return WAREHOUSE_LABEL;
    return raw;
}
