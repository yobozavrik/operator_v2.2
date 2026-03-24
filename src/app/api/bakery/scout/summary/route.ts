import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const PROMO_TYPES = new Set(['promotion', 'акція', 'promo']);
const NEW_SKU_TYPES = new Set(['new_sku', 'новий_sku', 'новинка']);
const PRICE_TYPES = new Set(['price_change', 'зміна_ціни', 'price']);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from =
    searchParams.get('from') ||
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const to = searchParams.get('to') || new Date().toISOString().split('T')[0];
  const useLegacy = searchParams.get('legacy') === '1';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    if (!useLegacy) {
      return NextResponse.json(
        {
          summary: {
            promo_count: 0,
            new_sku_count: 0,
            avg_discount: 0,
            top_active_competitor: '—',
            price_changes_count: 0,
          },
          period: { from, to },
          source: 'market_intel',
          error: 'Supabase env vars are not configured',
        },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: 'Supabase env vars are not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: events, error: eventErr } = await supabase
      .schema('market_intel')
      .from('normalized_events')
      .select('event_hash,event_type,event_date')
      .gte('event_date', from)
      .lte('event_date', to);

    if (eventErr) throw eventErr;

    const eventList = events || [];
    const promoCount = eventList.filter((e: any) => PROMO_TYPES.has(String(e.event_type).toLowerCase())).length;
    const newSkuCount = eventList.filter((e: any) => NEW_SKU_TYPES.has(String(e.event_type).toLowerCase())).length;
    const priceChanges = eventList.filter((e: any) => PRICE_TYPES.has(String(e.event_type).toLowerCase())).length;

    const hashes = eventList.map((e: any) => e.event_hash).filter(Boolean);
    const { data: rawRows } = hashes.length
      ? await supabase
          .schema('market_intel')
          .from('raw_events')
          .select('event_hash,competitor_handle,payload_json')
          .in('event_hash', hashes)
      : { data: [] as any[] };

    const discountValues = (rawRows || [])
      .map((row: any) => Number(row?.payload_json?.discount_pct || 0))
      .filter((value: number) => Number.isFinite(value) && value > 0);

    const avgDiscount =
      discountValues.length > 0
        ? discountValues.reduce((a: number, b: number) => a + b, 0) / discountValues.length
        : 0;

    const byHandle = (rawRows || []).reduce((acc: Record<string, number>, row: any) => {
      const handle = String(row?.competitor_handle || '').toLowerCase();
      if (!handle) return acc;
      acc[handle] = (acc[handle] || 0) + 1;
      return acc;
    }, {});

    const topHandle = Object.keys(byHandle).sort((a, b) => byHandle[b] - byHandle[a])[0];
    let topName = 'Немає даних';

    if (topHandle) {
      const { data: comp } = await supabase
        .schema('market_intel')
        .from('competitors')
        .select('name')
        .eq('handle', topHandle)
        .maybeSingle();
      topName = comp?.name || topHandle;
    }

    return NextResponse.json({
      summary: {
        promo_count: promoCount,
        new_sku_count: newSkuCount,
        avg_discount: Number(avgDiscount.toFixed(1)),
        top_active_competitor: topName,
        price_changes_count: priceChanges,
      },
      period: { from, to },
      source: 'market_intel',
    });
  } catch (error: any) {
    if (!useLegacy) {
      return NextResponse.json(
        {
          summary: {
            promo_count: 0,
            new_sku_count: 0,
            avg_discount: 0,
            top_active_competitor: '—',
            price_changes_count: 0,
          },
          period: { from, to },
          source: 'market_intel',
          error: error.message || 'market_intel query failed',
        },
        { status: 200 }
      );
    }

    const { data: legacyEvents, error: legacyError } = await supabase
      .schema('ml_forecasting')
      .from('scout_normalized_events')
      .select('*')
      .gte('event_date', from)
      .lte('event_date', to);

    if (legacyError) {
      return NextResponse.json({ error: legacyError.message }, { status: 500 });
    }

    const legacyRows = legacyEvents || [];
    const promoCount = legacyRows.filter((e: any) => String(e.event_type || '').toLowerCase().includes('promo')).length;
    const newSkuCount = legacyRows.filter((e: any) => String(e.event_type || '').toLowerCase().includes('sku')).length;
    const priceChanges = legacyRows.filter((e: any) => String(e.event_type || '').toLowerCase().includes('price')).length;

    const discountValues = legacyRows
      .map((row: any) => Number(row?.discount_pct || 0))
      .filter((value: number) => Number.isFinite(value) && value > 0);

    const avgDiscount =
      discountValues.length > 0
        ? discountValues.reduce((a: number, b: number) => a + b, 0) / discountValues.length
        : 0;

    return NextResponse.json({
      summary: {
        promo_count: promoCount,
        new_sku_count: newSkuCount,
        avg_discount: Number(avgDiscount.toFixed(1)),
        top_active_competitor: 'Legacy',
        price_changes_count: priceChanges,
      },
      period: { from, to },
      source: 'legacy_ml_forecasting',
    });
  }
}
