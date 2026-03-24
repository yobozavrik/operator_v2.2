import { SupabaseDeficitRow, ProductionTask, PriorityKey, SKUCategory } from '@/types/bi';
import { normalizeKonditerkaUnit } from '@/lib/konditerka-dictionary';

export const GRAVITON_SHOPS = [
    { id: 3, name: "Кварц" },
    { id: 5, name: "Гравітон" },
    { id: 6, name: "Руська" },
    { id: 10, name: "Садгора" },
    { id: 16, name: "Хотинська" },
    { id: 17, name: "Компас" },
    { id: 20, name: "Білоруська" }
];

export const STORES = GRAVITON_SHOPS.map(s => `Магазин "${s.name}"`);

export interface SKU {
    id: string;
    name: string;
    category: SKUCategory;
    currentStockKg: number;
    avgSalesKg: number;
    minStockKg: number;
}

export const mockSKUs: SKU[] = [
    { id: '1', name: 'Вареники з картоплею', category: 'ВАРЕНИКИ', currentStockKg: 12.5, avgSalesKg: 8.2, minStockKg: 25 },
    { id: '2', name: 'Пельмені "Домашні"', category: 'ПЕЛЬМЕНІ', currentStockKg: 5.0, avgSalesKg: 12.0, minStockKg: 40 },
    { id: '3', name: 'Хінкалі з яловичиною', category: 'ХІНКАЛІ', currentStockKg: 18.2, avgSalesKg: 5.5, minStockKg: 15 },
    { id: '4', name: 'Чебуреки з м\'ясом', category: 'ЧЕБУРЕКИ', currentStockKg: 2.1, avgSalesKg: 15.0, minStockKg: 30 },
];

export function getProductionQueue(skus: SKU[]): ProductionTask[] {
    return skus.map(sku => {
        const deficit = sku.minStockKg - sku.currentStockKg;
        const deficitPercent = (deficit / sku.minStockKg) * 100;

        let priority: PriorityKey = 'normal';
        if (sku.currentStockKg === 0) priority = 'critical';
        else if (sku.currentStockKg < sku.minStockKg * 0.5) priority = 'high';
        else if (sku.currentStockKg < sku.minStockKg) priority = 'reserve';

        return {
            id: sku.id,
            productCode: Number(sku.id),
            name: sku.name,
            category: sku.category,
            totalStockKg: sku.currentStockKg,
            dailyForecastKg: sku.avgSalesKg,
            minStockThresholdKg: sku.minStockKg,
            outOfStockStores: sku.currentStockKg === 0 ? 3 : 0,
            salesTrendKg: [sku.avgSalesKg * 0.8, sku.avgSalesKg * 1.1, sku.avgSalesKg],
            stores: [
                {
                    storeId: 1,
                    storeName: 'Магазин "Садгора"',
                    currentStock: sku.currentStockKg * 0.4,
                    minStock: sku.minStockKg * 0.4,
                    deficitKg: Math.max(0, (sku.minStockKg - sku.currentStockKg) * 0.4),
                    recommendedKg: Math.ceil(((sku.minStockKg - sku.currentStockKg) * 0.4) / 10) * 10,
                    avgSales: sku.avgSalesKg * 0.4
                },
                {
                    storeId: 2,
                    storeName: 'Магазин "Компас"',
                    currentStock: sku.currentStockKg * 0.6,
                    minStock: sku.minStockKg * 0.6,
                    deficitKg: Math.max(0, (sku.minStockKg - sku.currentStockKg) * 0.6),
                    recommendedKg: Math.ceil(((sku.minStockKg - sku.currentStockKg) * 0.6) / 10) * 10,
                    avgSales: sku.avgSalesKg * 0.6
                }
            ],
            recommendedQtyKg: Math.max(0, Math.ceil(deficit / 10) * 10),
            priority,
            priorityReason: priority === 'critical' ? 'Stock Out' : 'Below Minimum',
            status: 'pending' as const,
            deficitPercent: Math.max(0, deficitPercent)
        };
    });
}

/**
 * Transform raw Supabase data to ProductionTask
 * Relies on DB View for priority mapping
 */
export function transformDeficitData(data: SupabaseDeficitRow[]): ProductionTask[] {
    if (!data || !Array.isArray(data)) return [];

    return data.map((row) => {
        return {
            id: `${row.код_продукту}-${row.код_магазину}`,
            productCode: row.код_продукту,
            name: row.назва_продукту,
            category: (row.category_name?.toUpperCase() as SKUCategory) || 'Інше',
            totalStockKg: Number(row.current_stock),
            dailyForecastKg: Number(row.avg_sales_day),
            minStockThresholdKg: Number(row.min_stock),
            outOfStockStores: Number(row.current_stock) === 0 ? 1 : 0,
            salesTrendKg: [row.avg_sales_day],
            stores: [{
                storeId: row.код_магазину,
                storeName: row.назва_магазину,
                currentStock: Math.max(0, Number(row.current_stock)),
                minStock: Number(row.min_stock),
                deficitKg: Number(row.deficit_kg),
                recommendedKg: Number(row.recommended_kg),
                avgSales: Number(row.avg_sales_day),
                isLive: row.is_live
            }],
            recommendedQtyKg: Number(row.recommended_kg),
            priority: row.priority as PriorityKey,
            storeName: row.назва_магазину,
            priorityReason: `Store: ${row.назва_магазину}`,
            status: 'pending' as const,
            deficitPercent: Number(row.deficit_percent)
        };
    });
}

// Alias for backward compatibility
export const transformSupabaseData = transformDeficitData;


/**
 * Transformer for Pizza View (pizza1.v_pizza_orders)
 * Maps flat structure to ProductionTask
 */
export function transformPizzaData(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any[],
    options: { inferAvgFromMin?: boolean } = {}
): ProductionTask[] {
    const inferAvgFromMin = options.inferAvgFromMin ?? true;
    if (!data || !Array.isArray(data)) return [];

    const productMap = new Map<string, ProductionTask>();
    const storeIdMap = new Map<string, number>();
    let autoIdCounter = 1000; // Fallback counter for missing IDs
    let autoStoreIdCounter = 1; // Fallback counter for missing store IDs

    // Helper for safe number parsing (handles commas, nulls, undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safeNumber = (val: any): number => {
        if (val === null || val === undefined) return 0;
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            const clean = val.replace(',', '.').replace(/[^0-9.-]/g, '');
            return Number(clean) || 0;
        }
        return 0;
    };

    data.forEach((row) => {
        // Safe number parsing with comma support
        // MAPPING BASED ON USER LOGS: stock_now, norm_3_days, need_net
        const stock = safeNumber(row.current_stock ?? row.stock ?? row.stock_now ?? row.quantity);
        const min = safeNumber(row.min_stock ?? row.min ?? row.norm_3_days ?? row.min_qty);
        const netNeed = safeNumber(row.net_need ?? row.need ?? row.need_net ?? row.deficit);

        // Keep explicit 0 from backend as 0. Fallback only when avg field is truly absent.
        const avgSource = row.avg_sales_day ?? row.avg_sales ?? row.avg;
        let avg = safeNumber(avgSource);
        const hasExplicitAvg = avgSource !== null && avgSource !== undefined;
        if (inferAvgFromMin && !hasExplicitAvg && avg === 0 && min > 0) {
            avg = min / 3;
        }
        // Use product_id (or product_name if id missing) as unique key
        const productKey = row.product_id
            ? String(row.product_id)
            : (row.product_name || row.pizza_name || row.назва_продукту);

        if (!productKey) {
            console.warn('[Transform Pizza] Skipper row - no product key:', row);
            return;
        }

        // Generate fallback storeId
        const storeName = row.store_name || row.shop_name || row.spot_name || row.назва_магазину || 'Магазин';
        let storeId = row.store_id || row.spot_id || row.code;
        if (!storeId) {
            if (!storeIdMap.has(storeName)) {
                storeIdMap.set(storeName, autoStoreIdCounter++);
            }
            storeId = storeIdMap.get(storeName);
        }

        // Build Store Object
        const storeObj = {
            storeId: storeId,
            storeName: storeName,
            currentStock: stock,
            minStock: min,
            deficitKg: Math.max(0, netNeed),
            recommendedKg: Math.max(0, netNeed),
            avgSales: avg,
            distributionPlan: 0,
            surplusPriority: row.surplus_priority || row.priority,
            packaging_enabled: Boolean(row.packaging_enabled),
            stock_now_packs_est: safeNumber(row.stock_now_packs_est),
            min_stock_packs_est: safeNumber(row.min_stock_packs_est),
            need_net_packs_est: safeNumber(row.need_net_packs_est),
            quantity_to_ship_packs_est: safeNumber(row.quantity_to_ship_packs_est),
            pack_weight_min_kg: safeNumber(row.pack_weight_min_kg),
            pack_weight_max_kg: safeNumber(row.pack_weight_max_kg),
            pack_weight_calc_kg: safeNumber(row.pack_weight_calc_kg),
            pack_zero_threshold_kg: safeNumber(row.pack_zero_threshold_kg),
            packs_rounding_mode: row.packs_rounding_mode || null
        };

        if (productMap.has(productKey)) {
            // Aggregate to existing Product
            const existing = productMap.get(productKey)!;
            existing.totalStockKg += stock;
            existing.dailyForecastKg += avg;
            existing.minStockThresholdKg += min; // Sum up min stock thresholds
            existing.stores.push(storeObj);

            // Check trend or other aggregation logic if needed
            if (stock === 0) existing.outOfStockStores += 1;

        } else {
            // Create new Product entry
            const numericCode = row.product_id ? Number(row.product_id) : autoIdCounter++;

            productMap.set(productKey, {
                id: productKey,
                productCode: numericCode,
                name: row.product_name || row.назва_продукту || 'Unknown Product',
                category: 'ПІЦА', // Force single category
                totalStockKg: stock,
                dailyForecastKg: avg,
                minStockThresholdKg: min,
                outOfStockStores: stock === 0 ? 1 : 0,
                salesTrendKg: [avg], // Simple init
                stores: [storeObj],
                recommendedQtyKg: Math.max(0, netNeed),
                priority: 'normal',
                storeName: 'Multiple',
                priorityReason: 'Pizza Distribution',
                status: 'pending',
                deficitPercent: 0
            });
        }

    });

    return Array.from(productMap.values());
}

// Konditerka Data Transformer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformKonditerkaData(data: any[]): ProductionTask[] {
    const unitByProduct = new Map<string, 'шт' | 'кг'>();

    data.forEach((row) => {
        const productName = String(row.product_name || row.pizza_name || row.назва_продукту || '').trim();
        const numericId = Number(row.product_id);
        const unit = normalizeKonditerkaUnit(row.unit, productName);

        if (Number.isFinite(numericId) && numericId > 0) {
            unitByProduct.set(`id:${numericId}`, unit);
        }

        if (productName) {
            unitByProduct.set(`name:${productName.toLowerCase()}`, unit);
        }
    });

    const defaultTransformed = transformPizzaData(data, { inferAvgFromMin: false });
    return defaultTransformed.map(task => {
        const productUnit =
            unitByProduct.get(`id:${task.productCode}`) ||
            unitByProduct.get(`name:${task.name.toLowerCase()}`) ||
            normalizeKonditerkaUnit(undefined, task.name);

        // If the item is sold by weight (кг), the database tracks those sales and stock in grams.
        // We must divide by 1000 so the UI proudly displays it in true Kilograms.
        const multiplier = productUnit === 'кг' ? 0.001 : 1;

        return {
            ...task,
            unit: productUnit,
            totalStockKg: task.totalStockKg * multiplier,
            dailyForecastKg: task.dailyForecastKg * multiplier,
            minStockThresholdKg: task.minStockThresholdKg * multiplier,
            recommendedQtyKg: task.recommendedQtyKg * multiplier,
            stores: task.stores.map(store => ({
                ...store,
                unit: productUnit,
                currentStock: store.currentStock * multiplier,
                minStock: store.minStock * multiplier,
                deficitKg: store.deficitKg * multiplier,
                recommendedKg: store.recommendedKg * multiplier,
                avgSales: store.avgSales * multiplier
            }))
        };
    });
}

// Florida Data Transformer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformFloridaData(data: any[]): ProductionTask[] {
    const unitByProduct = new Map<string, 'шт' | 'кг'>();

    data.forEach((row) => {
        const productName = String(row.product_name || row.pizza_name || row.назва_продукту || '').trim();
        const numericId = Number(row.product_id);
        const normalizedUnit = String(row.unit || '').trim() === 'кг' ? 'кг' : 'шт';

        if (Number.isFinite(numericId) && numericId > 0) {
            unitByProduct.set(`id:${numericId}`, normalizedUnit);
        }

        if (productName) {
            unitByProduct.set(`name:${productName.toLowerCase()}`, normalizedUnit);
        }
    });

    const defaultTransformed = transformPizzaData(data);
    return defaultTransformed.map(task => {
        const productUnit =
            unitByProduct.get(`id:${task.productCode}`) ||
            unitByProduct.get(`name:${task.name.toLowerCase()}`) ||
            'шт';

        return {
            ...task,
            unit: productUnit,
            // Override category name 
            category: 'ФЛОРИДА',
            stores: task.stores.map(store => ({
                ...store,
                unit: productUnit,
            }))
        };
    });
}

// Bulvar Data Transformer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformBulvarData(data: any[]): ProductionTask[] {
    const unitByProduct = new Map<string, 'шт' | 'кг'>();

    data.forEach((row) => {
        const productName = String(row.product_name || row.pizza_name || row.назва_продукту || '').trim();
        const numericId = Number(row.product_id);
        const unit = String(row.unit || '').trim() === 'кг' ? 'кг' : 'шт';

        if (Number.isFinite(numericId) && numericId > 0) {
            unitByProduct.set(`id:${numericId}`, unit);
        }

        if (productName) {
            unitByProduct.set(`name:${productName.toLowerCase()}`, unit);
        }
    });

    const defaultTransformed = transformPizzaData(data);
    return defaultTransformed.map(task => {
        const unit =
            unitByProduct.get(`id:${task.productCode}`) ||
            unitByProduct.get(`name:${task.name.toLowerCase()}`) ||
            'шт';
        return {
            ...task,
            unit,
            category: 'БУЛЬВАР-АВТОВОКЗАЛ',
            stores: task.stores.map(store => ({
                ...store,
                unit
            }))
        };
    });
}
