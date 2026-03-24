import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ predictions: [], message: 'Forecasting feature is currently disabled.' });
}
