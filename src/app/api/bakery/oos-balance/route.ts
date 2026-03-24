import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { createClient as createSupabaseJSClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// spot_id → назва магазину
const SPOT_NAMES: Record<number, string> = {
  1:  'Пр. Героїв',
  2:  'Шкільна',
  3:  'Мала Бугаївка',
  4:  'Сосновий',
  5:  'Проспект',
  6:  'Центральна',
  7:  'Миколаївська',
  8:  'Козацька',
  9:  'Набережна',
  12: 'Харківська',
  13: 'Дніпровська',
  14: 'Гагаріна',
  15: 'Перемоги',
  16: 'Залізнична',
  17: 'Садова',
  18: 'Польова',
  19: 'Лісова',
  20: 'Паркова',
  21: 'Річкова',
  22: 'Степова',
  23: 'Заводська',
};

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);

    // Дата знімку (default: вчора)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const defaultDate = yesterday.toISOString().split('T')[0];
    const date = searchParams.get('date') || defaultDate;

    const supabase = createSupabaseJSClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Спочатку пробуємо balance_snapshots (real-time знімок)
    const { data: snapRows, error: snapError } = await supabase
      .schema('bakery1')
      .from('balance_snapshots')
      .select('spot_id, product_name, balance_qty')
      .eq('snapshot_type', 'evening')
      .gte('snapshot_time', `${date}T00:00:00Z`)
      .lt('snapshot_time', `${date}T23:59:59Z`)
      .order('spot_id')
      .order('product_name');

    // Якщо знімків немає — беремо з daily_oos
    let rows: { spot_id: number; product_name: string; balance_qty: number }[] = [];
    if (!snapError && snapRows && snapRows.length > 0) {
      rows = snapRows.map(r => ({ spot_id: r.spot_id, product_name: r.product_name, balance_qty: Number(r.balance_qty) }));
    } else {
      const { data: oosRows, error: oosError } = await supabase
        .schema('bakery1')
        .from('daily_oos')
        .select('spot_id, product_name, evening_balance, oos_final')
        .eq('date', date)
        .order('spot_id')
        .order('product_name');

      if (oosError) throw new Error(oosError.message);

      if (oosRows && oosRows.length > 0) {
        rows = oosRows.map(r => ({
          spot_id: r.spot_id,
          product_name: r.product_name,
          // oos_final=true → 0 (OOS), evening_balance>=0 → реальний залишок, -1 → невідомо
          balance_qty: r.oos_final ? 0 : (r.evening_balance >= 0 ? r.evening_balance : -1),
        }));
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ date, breads: [], stores: [], available_dates: [] });
    }

    // Унікальні хліби (колонки) — сортуємо за назвою
    const breads = [...new Set(rows.map((r) => r.product_name))].sort();

    // Унікальні магазини (рядки)
    const spotIds = [...new Set(rows.map((r) => r.spot_id))].sort((a, b) => a - b);

    // Будуємо pivot
    const stores = spotIds.map((spotId) => {
      const storeRows = rows.filter((r) => r.spot_id === spotId);
      const balances: Record<string, number> = {};
      for (const r of storeRows) {
        balances[r.product_name] = r.balance_qty;
      }
      const oosCount = breads.filter((b) => (balances[b] ?? -1) === 0).length;
      return {
        spot_id: spotId,
        store_name: SPOT_NAMES[spotId] ?? `Магазин ${spotId}`,
        balances,
        oos_count: oosCount,
      };
    });

    // Зведення: скільки OOS по кожному хлібу
    const breadOos: Record<string, number> = {};
    for (const bread of breads) {
      breadOos[bread] = stores.filter((s) => (s.balances[bread] ?? -1) === 0).length;
    }

    return NextResponse.json({
      date,
      breads,
      stores,
      bread_oos: breadOos,
      total_oos: stores.reduce((sum, s) => sum + s.oos_count, 0),
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    Logger.error('OOS Balance API Error', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
