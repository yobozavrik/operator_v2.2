import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { syncBranchProductionFromPoster } from '@/lib/branch-production-sync';
import { normalizeKonditerkaUnit } from '@/lib/konditerka-dictionary';
import { syncKonditerkaCatalogFromPoster } from '@/lib/konditerka-catalog';
import {
    applyKonditerkaPackagingConfigToRows,
    fetchKonditerkaPackagingConfig,
} from '@/lib/konditerka-packaging';

export const dynamic = 'force-dynamic';

async function refreshKonditerkaProductionCatalog(supabase: SupabaseClient) {
    const { error } = await supabase
        .schema('konditerka1')
        .rpc('refresh_production_180d_products', { p_product_ids: null });

    if (error) {
        Logger.error('[konditerka Orders API] catalog refresh failed', { error: error.message });
    }
}

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json(
                { error: 'Server Config Error', code: 'MISSING_SUPABASE_CONFIG' },
                { status: 500 }
            );
        }

        const supabase = createSupabaseClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false },
        });

        await refreshKonditerkaProductionCatalog(supabase);
        await syncKonditerkaCatalogFromPoster(supabase).catch((error) => {
            Logger.error('[konditerka Orders API] poster catalog sync failed', { error: String(error) });
            return [];
        });

        await syncBranchProductionFromPoster(supabase, 'konditerka1', 48).catch((error) => {
            Logger.error('[konditerka Orders API] live production sync failed', { error: String(error) });
            return null;
        });

        const { data, error } = await supabase
            .schema('konditerka1')
            .from('v_konditerka_distribution_stats')
            .select('*');

        if (error) {
            Logger.error('Supabase Konditerka API error', { error: error.message });
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const rows = data || [];
        const productIds = Array.from(
            new Set(
                rows
                    .map((row: Record<string, unknown>) => Number(row.product_id))
                    .filter((id) => Number.isFinite(id) && id > 0)
            )
        );

        const unitByProductId = new Map<number, 'шт' | 'кг'>();
        if (productIds.length > 0) {
            const { data: catalogRows, error: catalogError } = await supabase
                .schema('konditerka1')
                .from('production_180d_products')
                .select('product_id, unit')
                .in('product_id', productIds);

            if (catalogError) {
                Logger.error('[konditerka Orders API] catalog units query failed', { error: catalogError.message });
            } else {
                (catalogRows || []).forEach((row: Record<string, unknown>) => {
                    const id = Number(row.product_id);
                    if (!Number.isFinite(id) || id <= 0) return;
                    unitByProductId.set(id, normalizeKonditerkaUnit(row.unit));
                });
            }
        }

        const normalizedRows = rows.map((row: Record<string, unknown>) => {
            const productId = Number(row.product_id);
            const productName = String(row.product_name || '');
            return {
                ...row,
                unit: normalizeKonditerkaUnit(unitByProductId.get(productId), productName),
            };
        });

        const packagingConfigMap = await fetchKonditerkaPackagingConfig(
            supabase,
            normalizedRows.map((row: Record<string, unknown>) => Number(row.product_id))
        ).catch((error) => {
            Logger.warn('[konditerka Orders API] packaging config load failed', {
                meta: { error: String(error) },
            });
            return new Map();
        });

        const enrichedRows = applyKonditerkaPackagingConfigToRows(
            normalizedRows,
            packagingConfigMap
        );

        Logger.info('Konditerka rows loaded from Supabase', {
            meta: {
                count: enrichedRows.length,
                firstRow: enrichedRows[0],
            },
        });

        return NextResponse.json(enrichedRows);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        Logger.error('Critical Konditerka API Error', { error: message });
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message,
            },
            { status: 500 }
        );
    }
}
