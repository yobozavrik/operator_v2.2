import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function ceilTo10(n: number) {
  return Math.ceil(n / 10) * 10;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'date parameter required' }, { status: 400 });
  }

  try {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const [forecastRes, spotsRes] = await Promise.all([
      supabase
        .schema('bakery1')
        .from('demand_forecasts')
        .select('spot_id,product_id,product_name,predicted_qty,oos_prob,actual_qty,actual_oos,model_version,wape_cv')
        .eq('forecast_date', date)
        .order('spot_id')
        .order('product_id'),
      supabase
        .schema('categories')
        .from('spots')
        .select('spot_id, name')
        .eq('is_deleted', false),
    ]);

    if (forecastRes.error) {
      Logger.error('demand_forecasts fetch error', { error: forecastRes.error.message });
      return NextResponse.json({ error: forecastRes.error.message }, { status: 500 });
    }

    const rows = forecastRes.data ?? [];
    const spotMap = new Map((spotsRes.data ?? []).map(s => [s.spot_id, s.name]));

    // SKU list
    const skuMap = new Map<number, string>();
    for (const r of rows) skuMap.set(r.product_id, r.product_name);
    const skus = [...skuMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, name]) => ({ id, name }));

    // Store list
    const spotIds = [...new Set(rows.map(r => r.spot_id))].sort((a, b) => a - b);
    const stores = spotIds.map(id => ({
      id,
      name: spotMap.get(id) ?? `Магазин #${id}`,
    }));

    // Pivot (string keys for JSON safety)
    type Cell = { predicted_qty: number; oos_prob: number; actual_qty: number | null; actual_oos: boolean | null };
    const pivot: Record<string, Record<string, Cell>> = {};
    for (const r of rows) {
      const sk = String(r.spot_id);
      if (!pivot[sk]) pivot[sk] = {};
      pivot[sk][String(r.product_id)] = {
        predicted_qty: r.predicted_qty,
        oos_prob:      r.oos_prob ?? 0,
        actual_qty:    r.actual_qty ?? null,
        actual_oos:    r.actual_oos ?? null,
      };
    }

    // ── Order calculation ────────────────────────────────────
    // Per SKU: sum adjusted_qty (base + 1 if oos_prob > 0.5), round up to 10
    type OrderSkuRow = {
      sku_id:          number;
      sku_name:        string;
      forecast_total:  number;
      oos_stores:      number;   // stores where oos_prob > 0.5
      adjusted_total:  number;
      order_qty:       number;   // ceil to 10
      surplus:         number;
    };

    const orderProduction: OrderSkuRow[] = skus.map(sku => {
      let forecast_total = 0;
      let oos_stores     = 0;

      for (const store of stores) {
        const cell = pivot[String(store.id)]?.[String(sku.id)];
        if (!cell) continue;
        forecast_total += cell.predicted_qty;
        if (cell.oos_prob > 0.5) oos_stores++;
      }

      const adjusted_total = forecast_total + oos_stores;
      const order_qty      = ceilTo10(adjusted_total);
      const surplus        = order_qty - adjusted_total;

      return { sku_id: sku.id, sku_name: sku.name, forecast_total, oos_stores, adjusted_total, order_qty, surplus };
    }).filter(r => r.order_qty > 0);

    // Distribution: per store per SKU with adjusted qty
    // Surplus units go to top stores by (predicted_qty * oos_prob) descending
    type DistCell = { base_qty: number; oos_bonus: number; surplus_bonus: number; final_qty: number; oos_prob: number };
    const distribution: Record<string, Record<string, DistCell>> = {};

    for (const skuRow of orderProduction) {
      // Sort stores by priority for surplus: predicted_qty * oos_prob desc
      const storePriority = stores
        .map(store => {
          const cell = pivot[String(store.id)]?.[String(skuRow.sku_id)];
          return {
            store_id: store.id,
            priority: cell ? cell.predicted_qty * cell.oos_prob : 0,
            cell,
          };
        })
        .filter(s => s.cell)
        .sort((a, b) => b.priority - a.priority);

      // Distribute surplus 1 unit at a time to top priority stores
      const surplusRecipients = new Set<number>();
      let remaining = skuRow.surplus;
      for (const s of storePriority) {
        if (remaining <= 0) break;
        surplusRecipients.add(s.store_id);
        remaining--;
      }

      for (const store of stores) {
        const cell = pivot[String(store.id)]?.[String(skuRow.sku_id)];
        if (!cell) continue;

        const sk = String(store.id);
        if (!distribution[sk]) distribution[sk] = {};

        const oos_bonus     = cell.oos_prob > 0.5 ? 1 : 0;
        const surplus_bonus = surplusRecipients.has(store.id) ? 1 : 0;

        distribution[sk][String(skuRow.sku_id)] = {
          base_qty:    cell.predicted_qty,
          oos_bonus,
          surplus_bonus,
          final_qty:   cell.predicted_qty + oos_bonus + surplus_bonus,
          oos_prob:    cell.oos_prob,
        };
      }
    }

    const meta = rows.length > 0
      ? { model_version: rows[0].model_version, wape_cv: rows[0].wape_cv }
      : null;

    return NextResponse.json({
      date, stores, skus, pivot, meta,
      order: { production: orderProduction, distribution },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    Logger.error('bakery/forecasts critical error', { error: msg });
    return NextResponse.json({ error: 'Internal Server Error', message: msg }, { status: 500 });
  }
}
