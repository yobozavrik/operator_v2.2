import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAuth } from '@/lib/auth-guard';
import { SupabaseDeficitRow } from '@/types/bi';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabase = await createClient();

        const [{ data, error }, { data: catalog }, { data: productionToday, error: productionError }] =
            await Promise.all([
                supabase
                    .from('dashboard_deficit')
                    .select('*')
                    .order('РЅР°Р·РІР°_РјР°РіР°Р·РёРЅСѓ', { ascending: true })
                    .order('category_name', { ascending: true })
                    .order('РЅР°Р·РІР°_РїСЂРѕРґСѓРєС‚Сѓ', { ascending: true }),
                (supabase as any)
                    .schema('sadova1')
                    .from('production_catalog')
                    .select('product_id, portion_size, unit'),
                (supabase as any)
                    .schema('sadova1')
                    .from('production_today')
                    .select('"код_продукту", "вироблено_кількість"'),
            ]);

        if (error) {
            console.error('Supabase error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (productionError) {
            console.error('production_today error:', productionError);
        }

        const portionMap = new Map<string, { size: number; unit: string }>();
        (catalog || []).forEach((item: any) => {
            portionMap.set(String(item.product_id), {
                size: item.portion_size,
                unit: item.unit,
            });
        });

        const productionByProductId = new Map<number, number>();
        (productionToday || []).forEach((item: any) => {
            const productId = Number(item['код_продукту']);
            if (!Number.isFinite(productId) || productId <= 0) return;
            productionByProductId.set(
                productId,
                (productionByProductId.get(productId) || 0) + Number(item['вироблено_кількість'] || 0)
            );
        });

        const mappedData = (data || []).map((row: any) => {
            const productId = Number(row['код_продукту'] ?? row['РєРѕРґ_РїСЂРѕРґСѓРєС‚Сѓ'] ?? 0);
            const portion = portionMap.get(String(productId));

            return {
                ...row,
                priority_label:
                    row.priority_number === 1
                        ? 'critical'
                        : row.priority_number === 2
                            ? 'high'
                            : row.priority_number === 3
                                ? 'reserve'
                                : 'normal',
                portion_size: portion?.size || 0,
                portion_unit: portion?.unit || 'РєРі',
                today_production: productionByProductId.get(productId) || 0,
            } as SupabaseDeficitRow;
        });

        return NextResponse.json(mappedData);
    } catch (err: any) {
        console.error('Critical API Error:', err);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: err.message,
                stack: err.stack,
            },
            { status: 500 }
        );
    }
}
