import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

type ShopRow = { spot_id: number; storage_id: number; is_active: boolean };
type SpotRow = { spot_id: number; name: string };

function getServiceClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase service credentials');
    }

    return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabase = getServiceClient();
        const gravitonDb = supabase.schema('graviton');
        const categoriesDb = supabase.schema('categories');

        const { data: shopsRaw, error: shopsError } = await gravitonDb
            .from('distribution_shops')
            .select('spot_id, storage_id, is_active')
            .eq('is_active', true)
            .not('storage_id', 'is', null);

        if (shopsError) throw shopsError;
        if (!shopsRaw || shopsRaw.length === 0) {
            return NextResponse.json({ success: true, shops: [] });
        }

        const shopRows = shopsRaw as ShopRow[];
        const spotIds = Array.from(new Set(shopRows.map((row) => Number(row.spot_id))));

        const { data: spotsRaw, error: spotsError } = await categoriesDb
            .from('spots')
            .select('spot_id, name')
            .in('spot_id', spotIds);

        if (spotsError) throw spotsError;

        const spotNameById = new Map<number, string>(
            ((spotsRaw || []) as SpotRow[]).map((spot) => [Number(spot.spot_id), String(spot.name || '')])
        );

        const shops = shopRows
            .map((shop) => ({
                spot_id: Number(shop.spot_id),
                storage_id: Number(shop.storage_id),
                spot_name: spotNameById.get(Number(shop.spot_id)) || `Spot ${shop.spot_id}`,
                is_active: !!shop.is_active,
            }))
            .sort((a, b) => a.spot_name.localeCompare(b.spot_name, 'uk'));

        return NextResponse.json({
            success: true,
            shops,
        });
    } catch (err: any) {
        console.error('Shops fetch error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
