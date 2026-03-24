import { getAllLeftovers } from './poster-api';

interface DbOrderRow {
    product_id: string;
    product_name: string;
    spot_name: string;
    avg_sales_day: number;
    min_stock: number;
    stock_now: number;
    baked_at_factory: number;
    need_net: number;
    [key: string]: unknown;
}

const normalizeStore = (name: string) => {
    let clean = (name || '').toLowerCase().replace(/["'«»]/g, '');
    clean = clean.replace('магазин', '').trim();
    return clean;
};

const normalizeProduct = (name: string) => (name || '').toLowerCase().replace(/["'«»\s]/g, '');

interface MergeWithPosterOptions {
    categoryKeywords?: string[] | null;
    convertKgToGrams?: boolean;
    unitResolver?: (productName: string) => string;
    appendMissingProducts?: boolean;
}

export async function mergeWithPosterLiveStock(
    dbData: DbOrderRow[],
    options: MergeWithPosterOptions = {}
): Promise<DbOrderRow[]> {
    console.time('Poster API Fetch & Merge');
    const startTime = Date.now();
    const categoryKeywords =
        options.categoryKeywords === undefined ? ['кондитерка', 'морозиво'] : options.categoryKeywords;

    const allLeftovers = await getAllLeftovers({ categoryKeywords });
    const durationMs = Date.now() - startTime;

    let posterRecords = 0;
    const storagesCount = allLeftovers.length;

    const posterMap: Record<string, Record<string, number>> = {};
    for (const shop of allLeftovers) {
        posterRecords += shop.leftovers?.length || 0;
        const storeKey = normalizeStore(shop.storage_name);
        if (!posterMap[storeKey]) posterMap[storeKey] = {};

        for (const item of shop.leftovers) {
            const productKey = normalizeProduct(item.ingredient_name || '');
            posterMap[storeKey][productKey] = Number(item.storage_ingredient_left ?? item.ingredient_left ?? 0) || 0;
        }
    }

    console.log(
        JSON.stringify({
            timestamp: new Date().toISOString(),
            action: 'poster_api_fetch',
            duration_ms: durationMs,
            storages_count: storagesCount,
            records_count: posterRecords,
            success: true,
        })
    );

    let matchedCount = 0;
    const unmatchedStores = new Set<string>();
    const unmatchedProducts = new Set<string>();

    const mergedData = dbData.map((row) => {
        const storeKey = normalizeStore(row.spot_name);
        const productKey = normalizeProduct(row.product_name);

        let liveStock = row.stock_now;
        if (posterMap[storeKey] && posterMap[storeKey][productKey] !== undefined) {
            liveStock = posterMap[storeKey][productKey];
            matchedCount += 1;

            if (
                options.convertKgToGrams &&
                options.unitResolver &&
                options.unitResolver(row.product_name) === 'кг'
            ) {
                liveStock = Math.round(liveStock * 1000);
            }
        } else {
            if (!posterMap[storeKey]) unmatchedStores.add(row.spot_name);
            unmatchedProducts.add(row.product_name);
        }

        const safeLiveStock = Math.max(0, Number(liveStock) || 0);
        const safeMinStock = Math.max(0, Number(row.min_stock) || 0);
        const newNeedNet = Math.max(0, safeMinStock - safeLiveStock);

        return {
            ...row,
            stock_now: safeLiveStock,
            need_net: newNeedNet,
        };
    });

    if (options.appendMissingProducts) {
        const existingStoreNames = new Map<string, string>();
        const existingKeys = new Set<string>();

        for (const row of mergedData) {
            const storeKey = normalizeStore(String(row.spot_name || ''));
            const productKey = normalizeProduct(String(row.product_name || ''));
            if (storeKey) {
                existingStoreNames.set(storeKey, String(row.spot_name || '').trim());
            }
            if (storeKey && productKey) {
                existingKeys.add(`${storeKey}::${productKey}`);
            }
        }

        const appendedRows: DbOrderRow[] = [];
        for (const shop of allLeftovers) {
            const storeKey = normalizeStore(shop.storage_name || '');
            if (!storeKey) continue;

            const canonicalStoreName = existingStoreNames.get(storeKey) || String(shop.storage_name || '').trim();

            for (const item of shop.leftovers || []) {
                const productName = String(item.ingredient_name || '').trim();
                const productKey = normalizeProduct(productName);
                if (!productName || !productKey) continue;

                const pairKey = `${storeKey}::${productKey}`;
                if (existingKeys.has(pairKey)) continue;

                const productId = Number.parseInt(String(item.ingredient_id || ''), 10);
                if (!Number.isFinite(productId) || productId <= 0) continue;

                let stockNow = Number(item.storage_ingredient_left ?? item.ingredient_left ?? 0) || 0;
                if (
                    options.convertKgToGrams &&
                    options.unitResolver &&
                    options.unitResolver(productName) === 'кг'
                ) {
                    stockNow = Math.round(stockNow * 1000);
                }

                appendedRows.push({
                    product_id: String(productId),
                    product_name: productName,
                    spot_name: canonicalStoreName,
                    avg_sales_day: 0,
                    min_stock: 0,
                    stock_now: Math.max(0, stockNow),
                    baked_at_factory: 0,
                    need_net: 0,
                    is_live_only: true,
                });
                existingKeys.add(pairKey);
            }
        }

        if (appendedRows.length > 0) {
            mergedData.push(...appendedRows);
        }
    }

    console.log(
        JSON.stringify({
            timestamp: new Date().toISOString(),
            action: 'poster_merge_results',
            total_rows: mergedData.length,
            matched_rows: matchedCount,
            unmatched_stores_sample: Array.from(unmatchedStores).slice(0, 5),
            unmatched_products_sample: Array.from(unmatchedProducts).slice(0, 5),
            poster_map_stores: Object.keys(posterMap),
        })
    );

    console.timeEnd('Poster API Fetch & Merge');
    return mergedData;
}
