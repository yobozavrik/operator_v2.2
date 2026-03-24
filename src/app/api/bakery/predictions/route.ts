import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ predictions: [], message: 'Forecasting feature is currently disabled.' });
}
