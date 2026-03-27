import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  return NextResponse.json({ predictions: [], message: 'Forecasting feature is currently disabled.' });
}
