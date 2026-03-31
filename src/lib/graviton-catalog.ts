type MaybeNumber = number | string | null | undefined;

interface CatalogRow {
    product_id: number;
    product_name: string;
    is_active: boolean;
}

interface ManufactureProductRow {
    product_id?: MaybeNumber;
    product_name?: string | null;
    ingredient_name?: string | null;
    product_num?: MaybeNumber;
    storage_id?: MaybeNumber;
}

interface ManufactureDocRow {
    storage_id?: MaybeNumber;
    products?: ManufactureProductRow[] | null;
    product_id?: MaybeNumber;
    product_name?: string | null;
    ingredient_name?: string | null;
    product_num?: MaybeNumber;
}

interface ProductCategoryRow {
    id: number;
    category_id: MaybeNumber;
}

interface CategoryRow {
    category_id: MaybeNumber;
    category_name: string;
}

interface CandidateProduct {
    product_id: number;
    product_name: string;
    normalized_name: string;
}

export interface GravitonCatalogSyncStats {
    inserted: number;
    renamed: number;
    reactivated: number;
    skipped_without_id: number;
}

export function normalizeGravitonName(value: string): string {
    if (!value) return '';
    return value
        .normalize('NFKC')
        .trim()
        .toLowerCase()
        .replace(/[`´ʼ’‘']/g, '')
        .replace(/["«»]/g, '')
        .replace(/\s+/g, ' ');
}

function parsePositiveInt(value: MaybeNumber): number | null {
    const num = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(num) || num <= 0) return null;
    return num;
}

function normalizeProductName(product: ManufactureProductRow): string {
    const raw = String(product.product_name || product.ingredient_name || '').trim();
    return raw;
}

export interface FlattenedGravitonManufactureRow {
    storage_id: number | null;
    product_id: number | null;
    product_name: string;
    product_num: number;
}

export function extractGravitonManufactureProducts(
    rawManufactures: ManufactureDocRow[],
    productionStorageId: number | null = null
): FlattenedGravitonManufactureRow[] {
    const rows: FlattenedGravitonManufactureRow[] = [];

    for (const manufacture of rawManufactures || []) {
        const parentStorageId = parsePositiveInt(manufacture.storage_id);

        if (Array.isArray(manufacture.products) && manufacture.products.length > 0) {
            for (const product of manufacture.products) {
                const storageId = parsePositiveInt(product.storage_id) ?? parentStorageId;
                if (productionStorageId !== null && storageId !== productionStorageId) continue;

                const productName = normalizeProductName(product);
                const quantity = Number.parseFloat(String(product.product_num ?? '0').replace(',', '.')) || 0;

                rows.push({
                    storage_id: storageId,
                    product_id: parsePositiveInt(product.product_id),
                    product_name: productName,
                    product_num: quantity,
                });
            }
            continue;
        }

        if (productionStorageId !== null && parentStorageId !== productionStorageId) continue;

        const productName = normalizeProductName(manufacture);
        const quantity = Number.parseFloat(String(manufacture.product_num ?? '0').replace(',', '.')) || 0;

        if (!productName && quantity <= 0) continue;

        rows.push({
            storage_id: parentStorageId,
            product_id: parsePositiveInt(manufacture.product_id),
            product_name: productName,
            product_num: quantity,
        });
    }

    return rows;
}

async function loadCategoryMeta(categoriesDb: any, productIds: number[]): Promise<Map<number, { category_id: string; category_name: string }>> {
    const meta = new Map<number, { category_id: string; category_name: string }>();
    if (!Array.isArray(productIds) || productIds.length === 0) return meta;

    const { data: productsRaw, error: productsError } = await categoriesDb
        .from('products')
        .select('id, category_id')
        .in('id', productIds);

    if (productsError) {
        throw new Error(`Error fetching categories.products for catalog sync: ${productsError.message}`);
    }

    const products = (productsRaw || []) as ProductCategoryRow[];
    const categoryIds = Array.from(
        new Set(
            products
                .map((p) => p.category_id)
                .filter((x): x is MaybeNumber => x !== null && x !== undefined)
                .map((x) => String(x))
        )
    );

    const categoryNameById = new Map<string, string>();
    if (categoryIds.length > 0) {
        const { data: categoriesRaw, error: categoriesError } = await categoriesDb
            .from('categories')
            .select('category_id, category_name')
            .in('category_id', categoryIds);

        if (categoriesError) {
            throw new Error(`Error fetching categories.categories for catalog sync: ${categoriesError.message}`);
        }

        const categories = (categoriesRaw || []) as CategoryRow[];
        categories.forEach((cat) => {
            categoryNameById.set(String(cat.category_id), String(cat.category_name || ''));
        });
    }

    products.forEach((p) => {
        const categoryId = p.category_id !== null && p.category_id !== undefined ? String(p.category_id) : 'auto';
        meta.set(p.id, {
            category_id: categoryId,
            category_name: categoryNameById.get(categoryId) || 'Auto (from production)',
        });
    });

    return meta;
}

export async function syncGravitonCatalogFromManufactures(
    gravitonDb: any,
    categoriesDb: any,
    rawManufactures: ManufactureDocRow[],
    productionStorageId: number | null = 2
): Promise<GravitonCatalogSyncStats> {
    const stats: GravitonCatalogSyncStats = {
        inserted: 0,
        renamed: 0,
        reactivated: 0,
        skipped_without_id: 0,
    };

    const { data: catalogRaw, error: catalogError } = await gravitonDb
        .from('production_catalog')
        .select('product_id, product_name, is_active');

    if (catalogError) {
        throw new Error(`Error fetching graviton.production_catalog: ${catalogError.message}`);
    }

    const byProductId = new Map<number, CatalogRow>();
    ((catalogRaw || []) as CatalogRow[]).forEach((row) => {
        const id = parsePositiveInt(row.product_id);
        if (!id) return;
        byProductId.set(id, {
            product_id: id,
            product_name: String(row.product_name || ''),
            is_active: Boolean(row.is_active),
        });
    });

    const candidates = new Map<number, CandidateProduct>();
    for (const product of extractGravitonManufactureProducts(rawManufactures, productionStorageId)) {
        const productName = product.product_name;
        if (!productName) continue;

        const productId = parsePositiveInt(product.product_id);
        if (!productId) {
            stats.skipped_without_id += 1;
            continue;
        }

        if (!candidates.has(productId)) {
            candidates.set(productId, {
                product_id: productId,
                product_name: productName,
                normalized_name: normalizeGravitonName(productName),
            });
        }
    }

    if (candidates.size === 0) {
        return stats;
    }

    const missing: CandidateProduct[] = [];
    const toUpdate: Array<{ candidate: CandidateProduct; rename: boolean; reactivate: boolean }> = [];

    for (const candidate of candidates.values()) {
        const existing = byProductId.get(candidate.product_id);
        if (!existing) {
            missing.push(candidate);
            continue;
        }

        const existingNorm = normalizeGravitonName(existing.product_name);
        const rename = existingNorm !== candidate.normalized_name;
        const reactivate = !existing.is_active;

        if (rename || reactivate) {
            toUpdate.push({ candidate, rename, reactivate });
        }
    }

    if (missing.length > 0) {
        const metaMap = await loadCategoryMeta(categoriesDb, missing.map((m) => m.product_id));
        const insertRows = missing.map((item) => {
            const meta = metaMap.get(item.product_id);
            return {
                product_id: item.product_id,
                category_id: meta?.category_id || 'auto',
                category_name: meta?.category_name || 'Auto (from production)',
                product_name: item.product_name,
                portion_size: 1,
                unit: 'кг',
                is_active: true,
            };
        });

        const { error: insertError } = await gravitonDb
            .from('production_catalog')
            .insert(insertRows);

        if (insertError) {
            // Unique conflicts are acceptable (race condition between workers).
            const msg = String(insertError.message || '').toLowerCase();
            const isDuplicate = msg.includes('duplicate') || msg.includes('unique');
            if (!isDuplicate) {
                throw new Error(`Error inserting new catalog products: ${insertError.message}`);
            }
        } else {
            stats.inserted = insertRows.length;
        }
    }

    for (const item of toUpdate) {
        const patch: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };
        if (item.rename) patch.product_name = item.candidate.product_name;
        if (item.reactivate) patch.is_active = true;

        const { error: updateError } = await gravitonDb
            .from('production_catalog')
            .update(patch)
            .eq('product_id', item.candidate.product_id);

        if (updateError) {
            throw new Error(`Error updating catalog product_id=${item.candidate.product_id}: ${updateError.message}`);
        }

        if (item.rename) stats.renamed += 1;
        if (item.reactivate) stats.reactivated += 1;
    }

    return stats;
}
