import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sadova/confirm-delivery
 *
 * Confirms physical delivery for a set of shops on a given date.
 * Shops NOT in the list accumulate their pending distribution as debt.
 * Shops IN the list have their debt cleared.
 *
 * Body:
 *   {
 *     business_date: "2026-03-28",        // defaults to today (Kyiv TZ)
 *     delivered_spot_ids: [1, 2, 3]       // spot_ids that received delivery
 *   }
 *
 * Response:
 *   {
 *     success: true,
 *     delivered_spots: 3,
 *     delivered_rows: 12,
 *     debt_rows_added: 8
 *   }
 */
export async function POST(request: Request) {
    try {
        const auth = await requireAuth();
        if (auth.error) return auth.error;

        const body = await request.json().catch(() => ({}));

        const deliveredSpotIds: number[] = Array.isArray(body.delivered_spot_ids)
            ? body.delivered_spot_ids.map(Number).filter((n: number) => !isNaN(n))
            : [];

        const businessDate: string = body.business_date
            ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Missing Supabase service credentials');
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);

        const { data, error } = await supabase
            .schema('sadova1')
            .rpc('fn_confirm_delivery', {
                p_business_date: businessDate,
                p_delivered_spot_ids: deliveredSpotIds,
            });

        if (error) {
            throw new Error(`fn_confirm_delivery failed: ${error.message}`);
        }

        return NextResponse.json({
            success: true,
            business_date: businessDate,
            ...(data as object),
        });

    } catch (error: any) {
        console.error('confirm-delivery error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * GET /api/sadova/confirm-delivery?date=2026-03-28
 *
 * Returns current delivery debt state and today's pending distribution.
 * Useful for the logist UI to show what's owed per shop.
 */
export async function GET(request: Request) {
    try {
        const auth = await requireAuth();
        if (auth.error) return auth.error;

        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date')
            ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Missing Supabase service credentials');
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const sadovaDb = supabase.schema('sadova1');

        // Today's pending distribution grouped by shop
        const { data: pending, error: pendingError } = await sadovaDb
            .from('distribution_results')
            .select('spot_name, product_id, product_name, quantity_to_ship, delivery_status')
            .eq('business_date', date)
            .eq('delivery_status', 'pending')
            .neq('spot_name', 'Остаток на Складе')
            .order('spot_name');

        if (pendingError) throw new Error(pendingError.message);

        const normalizedPending = (pending || []).map(p => ({
            ...p,
            quantity_to_ship: (Number(p.quantity_to_ship) || 0) / 1000
        }));

        // Current accumulated debt per shop
        const { data: debt, error: debtError } = await sadovaDb
            .from('delivery_debt')
            .select('spot_id, spot_name, product_id, product_name, debt_kg, updated_at')
            .gt('debt_kg', 0)
            .order('spot_name');

        if (debtError) throw new Error(debtError.message);

        const normalizedDebt = (debt || []).map(d => ({
            ...d,
            debt_kg: (Number(d.debt_kg) || 0) / 1000
        }));

        // Active shops for the checklist UI
        const { data: shops, error: shopsError } = await sadovaDb
            .from('distribution_shops')
            .select('spot_id')
            .eq('is_active', true);

        if (shopsError) throw new Error(shopsError.message);

        return NextResponse.json({
            success: true,
            date,
            pending_distribution: normalizedPending,
            accumulated_debt: normalizedDebt,
            active_shop_ids: (shops ?? []).map((s: any) => s.spot_id),
        });

    } catch (error: any) {
        console.error('confirm-delivery GET error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
