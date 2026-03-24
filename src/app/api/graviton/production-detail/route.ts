import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        // Mock data to simulate production output
        const mockData = [
            { product_name: 'Пельмені "Домашні"', produced_weight: 45.5 },
            { product_name: 'Вареники з картоплею', produced_weight: 32.0 },
            { product_name: 'Блинці з м\'ясом', produced_weight: 18.2 },
            { product_name: 'Сирники', produced_weight: 12.5 },
            { product_name: 'Голубці', produced_weight: 24.8 },
            { product_name: 'Хінкалі', produced_weight: 10.0 },
        ].sort((a, b) => b.produced_weight - a.produced_weight);

        return NextResponse.json(mockData);
    } catch (error) {
        console.error('Error fetching production detail:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
