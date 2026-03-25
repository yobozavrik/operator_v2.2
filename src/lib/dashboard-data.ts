import { createClient } from '@/utils/supabase/server';
import { createServiceRoleClient } from '@/lib/branch-api';
import { syncPizzaLiveDataFromPoster } from '@/lib/pizza-live-sync';
import { fetchKonditerkaTodayProduction } from '@/lib/konditerka-production-source';
import { syncBranchProductionFromPoster } from '@/lib/branch-production-sync';
import { syncBulvarCatalogFromPoster } from '@/lib/bulvar-catalog';
import { Logger } from '@/lib/logger';

export type MetricsResponse = {
    shopLoad: number;
    criticalSKU: number;
    totalSKU: number;
    loadPercentage?: number;
    [key: string]: any;
};

export type SummaryResponse = {
    fill_index: number;
    total_baked?: number;
    total_need?: number;
    [key: string]: any;
};

function kyivBusinessDate(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Kyiv',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const month = parts.find((p) => p.type === 'month')?.value ?? '01';
    const day = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${year}-${month}-${day}`;
}

export async function getGravitonMetrics(): Promise<MetricsResponse> {
    try {
        const supabase = await createClient();
        const { data } = await supabase.from('dashboard_metrics').select('*').maybeSingle();
        
        if (!data) return { shopLoad: 0, criticalSKU: 0, totalSKU: 0 };

        return {
            shopLoad: Number(data.total_kg) || 0,
            criticalSKU: Number(data.critical_sku_count) || 0,
            totalSKU: Number(data.total_sku_count) || 0,
            loadPercentage: Math.min(100, Math.round((Number(data.total_kg || 0) / 662) * 100)),
        };
    } catch (e) {
        Logger.error('getGravitonMetrics failed', { error: String(e) });
        return { shopLoad: 0, criticalSKU: 0, totalSKU: 0 };
    }
}

export async function getPizzaSummary(): Promise<SummaryResponse> {
    try {
        const supabase = createServiceRoleClient();
        let liveTotalBaked: number | null = null;

        try {
            const syncResult = await Promise.race([
                syncPizzaLiveDataFromPoster(supabase),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Pizza sync timeout')), 2000)
                ),
            ]);
            liveTotalBaked = syncResult.totalProductionQty;
        } catch (e) {
            Logger.warn('Pizza live sync failed during RSC fetch');
        }

        const { data } = await supabase
            .schema('pizza1')
            .from('v_pizza_summary_stats')
            .select('total_baked, total_norm, total_need')
            .single();

        const baked = liveTotalBaked ?? Number(data?.total_baked || 0);
        const need = Number(data?.total_need || 0);
        const fillIndex = need > 0 ? (baked / need) * 100 : 0;

        return {
            fill_index: fillIndex,
            total_baked: baked,
            total_need: need
        };
    } catch (e) {
        return { fill_index: 0 };
    }
}

export async function getKonditerkaSummary(): Promise<SummaryResponse> {
    try {
        const supabase = await createClient();
        const { data } = await supabase
            .schema('konditerka1').from('v_konditerka_summary_stats')
            .select('total_baked, total_norm, total_need')
            .single();

        const summary = data || { total_baked: 0, total_need: 0 };
        let totalBaked = Number(summary.total_baked) || 0;

        if (totalBaked === 0) {
            try {
                const supabaseAdmin = createServiceRoleClient();
                const fallbackRows = await fetchKonditerkaTodayProduction(supabaseAdmin);
                totalBaked = fallbackRows.reduce((sum, row) => sum + (Number(row.baked_at_factory) || 0), 0);
            } catch (e) {}
        }

        const baked = totalBaked;
        const need = Number(summary.total_need || 0);
        const fillIndex = need > 0 ? (baked / need) * 100 : 0;

        return {
            fill_index: fillIndex,
            total_baked: baked,
            total_need: need
        };
    } catch (e) {
        return { fill_index: 0 };
    }
}

export async function getBulvarSummary(): Promise<SummaryResponse> {
    try {
        let liveTotalBaked: number | null = null;
        try {
            const serviceClient = createServiceRoleClient();
            const syncResult = await Promise.race([
                (async () => {
                    await syncBulvarCatalogFromPoster(serviceClient);
                    return syncBranchProductionFromPoster(serviceClient, 'bulvar1', 22);
                })(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Bulvar sync timeout')), 2500)
                ),
            ]);
            liveTotalBaked = syncResult.totalQty;
        } catch (e) {}

        const supabase = await createClient();
        const { data } = await supabase
            .schema('bulvar1')
            .from('v_bulvar_summary_stats')
            .select('total_baked, total_need, fill_index')
            .single();

        const baked = liveTotalBaked ?? Number(data?.total_baked || 0);
        const need = Number(data?.total_need || 0);
        const fillIndex = Number(data?.fill_index || 0);

        return {
            fill_index: fillIndex,
            total_baked: baked,
            total_need: need
        };
    } catch (e) {
        return { fill_index: 0 };
    }
}

export async function getSadovaMetrics(): Promise<MetricsResponse> {
    try {
        const supabase = createServiceRoleClient();
        const todayKyiv = kyivBusinessDate();

        const { data: results } = await supabase
            .schema('sadova1')
            .from('distribution_results')
            .select('product_id, quantity_to_ship')
            .eq('business_date', todayKyiv);

        const rows = (results || []) as any[];
        const totalKg = rows.reduce((sum, r) => sum + (Number(r.quantity_to_ship) || 0), 0);
        const skuCount = new Set(rows.map((r) => r.product_id).filter((id) => id !== null)).size;

        return {
            shopLoad: totalKg,
            criticalSKU: 0,
            totalSKU: skuCount,
        };
    } catch (e) {
        return { shopLoad: 0, criticalSKU: 0, totalSKU: 0 };
    }
}
