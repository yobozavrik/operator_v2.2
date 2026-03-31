import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const auth = await requireAuth();
        if (auth.error) return auth.error;

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Missing Supabase service credentials');
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const gravitonDb = supabase.schema('graviton');

        const { data, error } = await gravitonDb
            .from('production_today')
            .select('"код_продукту", "назва_продукту", "вироблено_кількість", "кількість_виробництв", "перше_виробництво", "останнє_виробництво"')
            .order('"вироблено_кількість"', { ascending: false });

        if (error) throw new Error(error.message);

        const rows = (data || []).map((row: any) => ({
            product_id: Number(row['код_продукту']),
            product_name: String(row['назва_продукту'] || ''),
            quantity_kg: Number(row['вироблено_кількість'] || 0),
            production_count: Number(row['кількість_виробництв'] || 0),
            first_production_at: row['перше_виробництво'] || null,
            last_production_at: row['останнє_виробництво'] || null,
        }));

        return NextResponse.json({
            success: true,
            data: rows,
            total_kg: rows.reduce((sum: number, row: any) => sum + Number(row.quantity_kg || 0), 0),
            synced_at: rows[0]?.last_production_at ?? null,
        });
    } catch (err: any) {
        console.error('production-daily GET error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
