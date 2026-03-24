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
        const { data, error } = await supabase
            .from('dashboard_deficit')
            .select('*')
            .order('назва_магазину', { ascending: true })
            .order('category_name', { ascending: true })
            .order('назва_продукту', { ascending: true });

        if (error) {
            console.error('Supabase error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Отримуємо довідник порційності
        const { data: catalog } = await (supabase as any)
            .schema('graviton')
            .from('production_catalog')
            .select('product_id, portion_size, unit');

        const portionMap = new Map();
        if (catalog) {
            catalog.forEach((item: any) => {
                portionMap.set(String(item.product_id), {
                    size: item.portion_size,
                    unit: item.unit
                });
            });
        }

        // Приводимо типи та нормалізуємо дані для фронтенду
        const mappedData = (data || []).map((row: any) => {
            const portion = portionMap.get(String(row.код_продукту));
            return {
                ...row,
                priority_label: row.priority_number === 1 ? 'critical' :
                    row.priority_number === 2 ? 'high' :
                        row.priority_number === 3 ? 'reserve' : 'normal',
                portion_size: portion?.size || 0,
                portion_unit: portion?.unit || 'кг'
            } as SupabaseDeficitRow;
        });

        return NextResponse.json(mappedData);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        console.error('Critical API Error:', err);
        return NextResponse.json({
            error: 'Internal Server Error',
            message: err.message,
            stack: err.stack
        }, { status: 500 });
    }
}
