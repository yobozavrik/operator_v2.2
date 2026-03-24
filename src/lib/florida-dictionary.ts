export type FloridaUnit = 'шт' | 'кг';

const KG_HINTS = ['kg', 'кг', 'кілограм', 'килограмм', 'gram', 'грам', 'гр', 'g'];
const PCS_HINTS = ['шт', 'pcs', 'pc', 'piece'];

/**
 * Legacy name-based fallback for products where upstream unit is unavailable.
 */
export function getFloridaUnit(productName: string): FloridaUnit {
    const normName = productName.toLowerCase().trim();
    if (normName.includes('вагова') || normName.includes('ваговий')) {
        return 'кг';
    }
    return 'шт';
}

/**
 * Normalize raw unit from data source to UI-safe unit.
 * Falls back to name-based heuristic for backward compatibility.
 */
export function normalizeFloridaUnit(unitRaw: unknown, productName = ''): FloridaUnit {
    if (typeof unitRaw === 'string') {
        const normalized = unitRaw.toLowerCase().trim();
        if (KG_HINTS.some((hint) => normalized === hint || normalized.includes(hint))) {
            return 'кг';
        }
        if (PCS_HINTS.some((hint) => normalized === hint || normalized.includes(hint))) {
            return 'шт';
        }
    }

    return getFloridaUnit(productName);
}
