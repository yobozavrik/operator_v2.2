import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { fetchKonditerkaTodayProduction } from '@/lib/konditerka-production-source';
import { normalizeKonditerkaUnit } from '@/lib/konditerka-dictionary';
import { syncKonditerkaCatalogFromPoster } from '@/lib/konditerka-catalog';

export const dynamic = 'force-dynamic';

interface ProductionDetailRow {
    product_id: number | null;
    product_name: string;
    baked_at_factory: number;
}

async function loadCatalogUnits(productIds: number[]) {
    const unitByProductId = new Map<number, 'шт' | 'кг'>();
    if (productIds.length === 0) return unitByProductId;

    const { data: catalogRows, error } = await supabase
        .schema('konditerka1')
        .from('production_180d_products')
        .select('product_id, unit')
        .in('product_id', productIds);

    if (error) {
        console.warn('[Konditerka Production Detail] catalog units lookup failed:', error.message);
        return unitByProductId;
    }

    (catalogRows || []).forEach((row: Record<string, unknown>) => {
        const id = Number(row.product_id);
        if (!Number.isFinite(id) || id <= 0) return;
        unitByProductId.set(id, normalizeKonditerkaUnit(row.unit));
    });

    return unitByProductId;
}

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
            const supabaseAdmin = createServiceRoleClient();
            await syncKonditerkaCatalogFromPoster(supabaseAdmin).catch((error) => {
                console.warn('[Konditerka Production Detail] poster catalog sync failed:', error);
                return [];
            });
        }

        const { data, error } = await supabase
            .schema('konditerka1')
            .from('v_konditerka_production_only')
            .select('product_id, product_name, baked_at_factory')
            .order('baked_at_factory', { ascending: false });

        if (error) {
            console.error('[Konditerka Production Detail] Supabase error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const rows = (data || []) as ProductionDetailRow[];
        if (rows.length > 0) {
            const productIds = Array.from(
                new Set(rows.map((row) => Number(row.product_id)).filter((id) => Number.isFinite(id) && id > 0))
            );
            const unitByProductId = await loadCatalogUnits(productIds);

            return NextResponse.json(
                rows.map((row) => ({
                    product_id: Number(row.product_id),
                    product_name: row.product_name,
                    baked_at_factory: Math.round(Number(row.baked_at_factory) || 0),
                    unit: normalizeKonditerkaUnit(unitByProductId.get(Number(row.product_id)), row.product_name),
                }))
            );
        }

        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return NextResponse.json([]);
        }

        const supabaseAdmin = createServiceRoleClient();
        let fallbackRows: Array<{ product_id?: number; product_name: string; baked_at_factory: number }> = [];
        try {
            fallbackRows = await fetchKonditerkaTodayProduction(supabaseAdmin);
        } catch (fallbackError) {
            console.warn('[Konditerka Production Detail] fallback failed:', fallbackError);
            fallbackRows = [];
        }

        const fallbackProductIds = Array.from(
            new Set(fallbackRows.map((row) => Number(row.product_id)).filter((id) => Number.isFinite(id) && id > 0))
        );
        const unitByProductId = await loadCatalogUnits(fallbackProductIds);

        return NextResponse.json(
            fallbackRows.map((row) => ({
                product_id: Number(row.product_id || 0) || undefined,
                product_name: row.product_name,
                baked_at_factory: Math.round(row.baked_at_factory),
                unit: normalizeKonditerkaUnit(unitByProductId.get(Number(row.product_id || 0)), row.product_name),
            }))
        );
    } catch (error) {
        console.error('[Konditerka Production Detail] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
