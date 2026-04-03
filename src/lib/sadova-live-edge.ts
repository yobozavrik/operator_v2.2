import { normalizeSadovaName } from './sadova-catalog';

type MaybeNumber = number | string | null | undefined;

type EdgeManufactureRow = {
    storage_id?: MaybeNumber;
    product_id?: MaybeNumber;
    product_name?: string | null;
    ingredient_name?: string | null;
    product_name_normalized?: string | null;
    quantity?: MaybeNumber;
    product_num?: MaybeNumber;
};

function toPositiveInt(value: MaybeNumber): number | null {
    const parsed = Math.trunc(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
}

function toPositiveNumber(value: MaybeNumber): number {
    const parsed = Number.parseFloat(String(value ?? '0').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed;
}

export interface SadovaEdgeProductionRow {
    storage_id: number | null;
    product_id: number | null;
    product_name: string;
    product_name_normalized: string;
    quantity: number;
}

export function extractSadovaEdgeProduction(
    edgePayload: unknown,
    productionStorageId: number | null = 2
): SadovaEdgeProductionRow[] {
    if (!edgePayload || typeof edgePayload !== 'object') return [];

    const payload = edgePayload as { manufactures?: EdgeManufactureRow[] | null };
    const rows = Array.isArray(payload.manufactures) ? payload.manufactures : [];
    if (rows.length === 0) return [];

    return rows
        .map((row) => {
            const storageId = toPositiveInt(row.storage_id);
            if (productionStorageId !== null && storageId !== productionStorageId) return null;

            const productName = String(row.product_name || row.ingredient_name || '').trim();
            const quantity = toPositiveNumber(row.quantity ?? row.product_num);
            if (!productName || quantity <= 0) return null;

            return {
                storage_id: storageId,
                product_id: toPositiveInt(row.product_id),
                product_name: productName,
                product_name_normalized:
                    String(row.product_name_normalized || '').trim() || normalizeSadovaName(productName),
                quantity,
            };
        })
        .filter((row): row is SadovaEdgeProductionRow => row !== null);
}
