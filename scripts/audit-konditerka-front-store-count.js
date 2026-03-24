require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase configuration');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function normalizeUnit(rawUnit) {
  const normalized = String(rawUnit || '').trim().toLowerCase();
  if (normalized === 'kg' || normalized === 'кг') return 'кг';
  if (normalized === 'шт' || normalized === 'pcs' || normalized === 'piece' || normalized === 'pieces') return 'шт';
  return 'кг';
}

function safeNumber(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const clean = val.replace(',', '.').replace(/[^0-9.-]/g, '');
    return Number(clean) || 0;
  }
  return 0;
}

function transformPizzaData(data) {
  const productMap = new Map();
  const storeIdMap = new Map();
  let autoIdCounter = 1000;
  let autoStoreIdCounter = 1;

  data.forEach((row) => {
    const stock = safeNumber(row.current_stock || row.stock || row.stock_now || row.quantity);
    const min = safeNumber(row.min_stock || row.min || row.norm_3_days || row.min_qty);
    const netNeed = safeNumber(row.net_need || row.need || row.need_net || row.deficit);
    const avgSource = row.avg_sales_day ?? row.avg_sales ?? row.avg;
    const avg = safeNumber(avgSource);
    const productKey = row.product_id ? String(row.product_id) : (row.product_name || row.pizza_name || row['назва_продукту']);
    if (!productKey) return;

    const storeName = row.store_name || row.shop_name || row.spot_name || row['назва_магазину'] || 'Магазин';
    let storeId = row.store_id || row.spot_id || row.code;
    if (!storeId) {
      if (!storeIdMap.has(storeName)) {
        storeIdMap.set(storeName, autoStoreIdCounter++);
      }
      storeId = storeIdMap.get(storeName);
    }

    const storeObj = {
      storeId,
      storeName,
      currentStock: stock,
      minStock: min,
      deficitKg: Math.max(0, netNeed),
      recommendedKg: Math.max(0, netNeed),
      avgSales: avg,
    };

    if (productMap.has(productKey)) {
      const existing = productMap.get(productKey);
      existing.totalStockKg += stock;
      existing.dailyForecastKg += avg;
      existing.minStockThresholdKg += min;
      existing.stores.push(storeObj);
      if (stock === 0) existing.outOfStockStores += 1;
    } else {
      const numericCode = row.product_id ? Number(row.product_id) : autoIdCounter++;
      productMap.set(productKey, {
        id: productKey,
        productCode: numericCode,
        name: row.product_name || row['назва_продукту'] || 'Unknown Product',
        totalStockKg: stock,
        dailyForecastKg: avg,
        minStockThresholdKg: min,
        outOfStockStores: stock === 0 ? 1 : 0,
        stores: [storeObj],
        recommendedQtyKg: Math.max(0, netNeed),
      });
    }
  });

  return Array.from(productMap.values());
}

function transformKonditerkaData(data) {
  const unitByProduct = new Map();

  data.forEach((row) => {
    const productName = String(row.product_name || row.pizza_name || row['назва_продукту'] || '').trim();
    const numericId = Number(row.product_id);
    const unit = normalizeUnit(row.unit);
    if (Number.isFinite(numericId) && numericId > 0) unitByProduct.set(`id:${numericId}`, unit);
    if (productName) unitByProduct.set(`name:${productName.toLowerCase()}`, unit);
  });

  const defaultTransformed = transformPizzaData(data);
  return defaultTransformed.map((task) => {
    const productUnit =
      unitByProduct.get(`id:${task.productCode}`) ||
      unitByProduct.get(`name:${task.name.toLowerCase()}`) ||
      'кг';
    const multiplier = productUnit === 'кг' ? 0.001 : 1;

    return {
      ...task,
      unit: productUnit,
      stores: task.stores.map((store) => ({
        ...store,
        unit: productUnit,
        currentStock: store.currentStock * multiplier,
        minStock: store.minStock * multiplier,
        deficitKg: store.deficitKg * multiplier,
        recommendedKg: store.recommendedKg * multiplier,
        avgSales: store.avgSales * multiplier,
      })),
    };
  });
}

async function main() {
  const { data: rows, error } = await supabase
    .schema('konditerka1')
    .from('v_konditerka_distribution_stats')
    .select('*');

  if (error) throw error;

  const productIds = [...new Set((rows || []).map((row) => Number(row.product_id)).filter((id) => id > 0))];
  const { data: catalogRows, error: catalogError } = await supabase
    .schema('konditerka1')
    .from('production_180d_products')
    .select('product_id, unit')
    .in('product_id', productIds);

  if (catalogError) throw catalogError;

  const unitByProductId = new Map();
  (catalogRows || []).forEach((row) => {
    unitByProductId.set(Number(row.product_id), normalizeUnit(row.unit));
  });

  const enrichedRows = (rows || []).map((row) => ({
    ...row,
    unit: unitByProductId.get(Number(row.product_id)) || normalizeUnit(undefined),
  }));

  const tasks = transformKonditerkaData(enrichedRows);
  const storeMap = new Map();
  tasks.forEach((task) => {
    task.stores.forEach((store) => {
      if (!storeMap.has(store.storeName)) {
        storeMap.set(store.storeName, {
          storeId: store.storeId,
          storeName: store.storeName,
        });
      }
    });
  });

  console.log(JSON.stringify({
    raw_rows: rows.length,
    transformed_products: tasks.length,
    transformed_distinct_stores: storeMap.size,
    stores: Array.from(storeMap.values()).sort((a, b) => String(a.storeName).localeCompare(String(b.storeName))),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
