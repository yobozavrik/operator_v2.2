import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAuth } from '@/lib/auth-guard';

function defaultPredictionDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') ?? defaultPredictionDate();

    const { data, error } = await supabase
      .schema('ml_forecasting')
      .from('predictions')
      .select('prediction_date, store_id, sku_id, recommended_kg, confidence_score, model_version')
      .eq('prediction_date', date);

    if (error) {
      console.error('Error fetching ML predictions:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error: any) {
    console.error('Unexpected error in ML predictions API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
