import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  const useLegacy = false;

  try {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: events, error } = await supabase
      .schema('market_intel')
      .from('normalized_events')
      .select('event_type,severity,event_date,summary_uk')
      .gte('event_date', from)
      .lte('event_date', to)
      .order('event_date', { ascending: false })
      .limit(200);

    if (error) throw error;

    const rows = events || [];
    const promoHigh = rows.filter((e: any) => e.event_type === 'promotion' && e.severity === 'high').length;
    const newSkuCount = rows.filter((e: any) => e.event_type === 'new_sku').length;
    const priceChangeCount = rows.filter((e: any) => e.event_type === 'price_change').length;

    const recommendations = [
      {
        id: 'scout-rec-1',
        date: to,
        priority: promoHigh > 0 ? 'high' : 'medium',
        status: 'new',
        text_uk:
          promoHigh > 0
            ? 'Зафіксовано агресивні промо у конкурентів. Перевірте ціни на ключові хлібні позиції.'
            : 'Промо-активність конкурентів контрольована. Утримуйте поточну цінову стратегію.',
        rationale: `High-promo signals: ${promoHigh}`,
      },
      {
        id: 'scout-rec-2',
        date: to,
        priority: newSkuCount >= 3 ? 'medium' : 'low',
        status: 'new',
        text_uk:
          newSkuCount >= 3
            ? 'Конкуренти активно запускають новинки. Рекомендовано оновити матрицю тестових SKU.'
            : 'Кількість новинок у конкурентів низька. Пріоритет на стабільність асортименту.',
        rationale: `New SKU signals (7d): ${newSkuCount}`,
      },
      {
        id: 'scout-rec-3',
        date: to,
        priority: priceChangeCount >= 5 ? 'medium' : 'low',
        status: 'new',
        text_uk:
          priceChangeCount >= 5
            ? 'У конкурентів часті зміни цін. Оновіть щотижневий моніторинг прайсів по ТОП-20 SKU.'
            : 'Зміни цін у конкурентів незначні. Планові моніторинги достатні.',
        rationale: `Price change signals (7d): ${priceChangeCount}`,
      },
    ];

    return NextResponse.json({ recommendations, source: 'market_intel' });
  } catch (error: any) {
    if (!useLegacy) {
      return NextResponse.json(
        {
          recommendations: [],
          source: 'market_intel',
          error: error.message || 'market_intel query failed',
        },
        { status: 200 }
      );
    }

    const { data: recommendations, error: legacyError } = await supabase
      .schema('ml_forecasting')
      .from('scout_recommendations')
      .select('*')
      .order('date', { ascending: false })
      .limit(10);

    if (legacyError) {
      return NextResponse.json({ error: legacyError.message }, { status: 500 });
    }

    return NextResponse.json({ recommendations: recommendations || [], source: 'legacy_ml_forecasting' });
  }
}
