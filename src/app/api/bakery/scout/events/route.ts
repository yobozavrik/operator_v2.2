import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const competitor = searchParams.get('competitor');
  const eventType = searchParams.get('type');
  const q = searchParams.get('q');
  const useLegacy = searchParams.get('legacy') === '1';

  try {
    let query = supabase
      .schema('market_intel')
      .from('normalized_events')
      .select('*')
      .order('event_date', { ascending: false })
      .limit(300);

    if (from) query = query.gte('event_date', from);
    if (to) query = query.lte('event_date', to);
    if (eventType) query = query.eq('event_type', eventType);
    if (q) query = query.ilike('summary_uk', `%${q}%`);

    const { data: normalized, error: normalizedError } = await query;
    if (normalizedError) throw normalizedError;

    const hashes = (normalized ?? []).map((e: any) => e.event_hash).filter(Boolean);
    const { data: rawRows } = hashes.length
      ? await supabase
          .schema('market_intel')
          .from('raw_events')
          .select('event_hash,competitor_handle,payload_json')
          .in('event_hash', hashes)
      : { data: [] as any[] };

    const rawByHash = new Map((rawRows ?? []).map((row: any) => [row.event_hash, row]));
    const handles = Array.from(new Set((rawRows ?? []).map((r: any) => r.competitor_handle).filter(Boolean)));

    const { data: competitors } = handles.length
      ? await supabase
          .schema('market_intel')
          .from('competitors')
          .select('handle,name')
          .in('handle', handles)
      : { data: [] as any[] };

    const competitorByHandle = new Map(
      (competitors ?? []).map((c: any) => [String(c.handle).toLowerCase(), c.name || c.handle])
    );

    const events = (normalized ?? [])
      .map((event: any) => {
        const raw = rawByHash.get(event.event_hash);
        const handle = String(raw?.competitor_handle || '').toLowerCase();
        const competitorName = competitorByHandle.get(handle) || raw?.competitor_handle || 'Невідомо';

        return {
          id: event.event_hash,
          event_type: event.event_type,
          sku_name: raw?.payload_json?.sku_name ?? null,
          category: raw?.payload_json?.category ?? null,
          promo_type: raw?.payload_json?.promo_type ?? null,
          old_price: raw?.payload_json?.old_price ?? null,
          new_price: raw?.payload_json?.new_price ?? null,
          discount_pct: raw?.payload_json?.discount_pct ?? null,
          confidence: event.confidence ?? raw?.payload_json?.confidence ?? 0,
          summary_uk: event.summary_uk,
          event_date: event.event_date,
          severity: event.severity || 'medium',
          competitor: { name: competitorName },
          tags: Array.isArray(raw?.payload_json?.tags)
            ? raw.payload_json.tags.map((tag: string) => ({ tag }))
            : [],
        };
      })
      .filter((event: any) =>
        competitor ? event.competitor.name.toLowerCase().includes(competitor.toLowerCase()) : true
      );

    return NextResponse.json({ events, source: 'market_intel' });
  } catch (error: any) {
    if (!useLegacy) {
      return NextResponse.json(
        {
          events: [],
          source: 'market_intel',
          error: error.message || 'market_intel query failed',
        },
        { status: 200 }
      );
    }

    let fallbackQuery = supabase
      .schema('ml_forecasting')
      .from('scout_normalized_events')
      .select(`*, competitor:scout_competitors(name), tags:scout_event_tags(tag)`)
      .order('event_date', { ascending: false });

    if (from) fallbackQuery = fallbackQuery.gte('event_date', from);
    if (to) fallbackQuery = fallbackQuery.lte('event_date', to);
    if (eventType) fallbackQuery = fallbackQuery.eq('event_type', eventType);
    if (q) fallbackQuery = fallbackQuery.ilike('summary_uk', `%${q}%`);

    const { data: events, error: fallbackError } = await fallbackQuery;
    if (fallbackError) {
      return NextResponse.json({ error: fallbackError.message }, { status: 500 });
    }

    return NextResponse.json({ events, source: 'legacy_ml_forecasting' });
  }
}
