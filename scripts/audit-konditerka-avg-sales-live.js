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

function kyivDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(date);
}

function addDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

async function fetchAll(queryBuilderFactory, pageSize = 1000) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await queryBuilderFactory()
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function main() {
  const today = kyivDateString();
  const fromDate = addDays(today, -14);

  const catalogRows = await fetchAll(() =>
    supabase
      .schema('konditerka1')
      .from('production_180d_products')
      .select('product_id, product_name, category_name, unit, poster_weight_flag')
      .not('category_name', 'is', null)
      .order('product_id', { ascending: true })
  );

  const productIds = [...new Set(catalogRows.map((row) => Number(row.product_id)).filter((id) => id > 0))];

  const viewRows = await fetchAll(() =>
    supabase
      .schema('konditerka1')
      .from('v_konditerka_distribution_stats')
      .select('product_id, product_name, spot_id, spot_name, avg_sales_day, min_stock, stock_now')
      .in('product_id', productIds)
      .order('product_id', { ascending: true })
      .order('spot_id', { ascending: true })
  );

  const spotIds = [...new Set(viewRows.map((row) => Number(row.spot_id)).filter((id) => id > 0))];

  const txRows = await fetchAll(() =>
    supabase
      .schema('categories')
      .from('transactions')
      .select('transaction_id, spot_id, date_close')
      .gte('date_close', fromDate)
      .lt('date_close', today)
      .in('spot_id', spotIds)
      .order('transaction_id', { ascending: true })
  );

  const txById = new Map();
  txRows.forEach((row) => {
    txById.set(Number(row.transaction_id), Number(row.spot_id));
  });

  const txIds = [...txById.keys()];
  const actualAvgMap = new Map();
  const chunkSize = 500;

  for (let i = 0; i < txIds.length; i += chunkSize) {
    const chunk = txIds.slice(i, i + chunkSize);
    const itemRows = await fetchAll(() =>
      supabase
        .schema('categories')
        .from('transaction_items')
        .select('transaction_id, product_id, num')
        .in('transaction_id', chunk)
        .in('product_id', productIds)
    );

    itemRows.forEach((row) => {
      const transactionId = Number(row.transaction_id);
      const productId = Number(row.product_id);
      const spotId = txById.get(transactionId);
      if (!spotId || !productId) return;
      const qty = Number(row.num || 0);
      const key = `${productId}:${spotId}`;
      actualAvgMap.set(key, (actualAvgMap.get(key) || 0) + qty);
    });
  }

  const mismatches = [];
  let compared = 0;
  let exact = 0;

  for (const row of viewRows) {
    const productId = Number(row.product_id);
    const spotId = Number(row.spot_id);
    const key = `${productId}:${spotId}`;
    const actualAvg = Number(((actualAvgMap.get(key) || 0) / 14).toFixed(6));
    const viewAvg = Number(Number(row.avg_sales_day || 0).toFixed(6));
    const diff = Number((viewAvg - actualAvg).toFixed(6));
    const absDiff = Math.abs(diff);

    compared += 1;
    if (absDiff < 0.000001) exact += 1;

    if (absDiff >= 0.01) {
      mismatches.push({
        product_id: productId,
        product_name: row.product_name,
        spot_id: spotId,
        spot_name: row.spot_name,
        view_avg_sales_day: viewAvg,
        actual_avg_sales_day: Number(actualAvg.toFixed(3)),
        diff: Number(diff.toFixed(3)),
        min_stock: Number(row.min_stock || 0),
        stock_now: Number(row.stock_now || 0),
      });
    }
  }

  mismatches.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const topByProduct = new Map();
  for (const row of mismatches) {
    const current = topByProduct.get(row.product_id) || { ...row, stores: 0, max_abs_diff: 0 };
    current.stores += 1;
    current.max_abs_diff = Math.max(current.max_abs_diff, Math.abs(row.diff));
    topByProduct.set(row.product_id, current);
  }

  const summary = {
    date_from: fromDate,
    date_to_exclusive: today,
    catalog_products: catalogRows.length,
    compared_rows: compared,
    exact_rows: exact,
    mismatched_rows: mismatches.length,
    mismatched_products: topByProduct.size,
    top_mismatches: mismatches.slice(0, 20),
    top_products: Array.from(topByProduct.values())
      .sort((a, b) => b.max_abs_diff - a.max_abs_diff)
      .slice(0, 20)
      .map((row) => ({
        product_id: row.product_id,
        product_name: row.product_name,
        affected_stores: row.stores,
        max_abs_diff: Number(row.max_abs_diff.toFixed(3)),
      })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
