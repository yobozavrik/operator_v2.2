import type { SupabaseClient } from '@supabase/supabase-js';
import { syncBranchProductionFromPoster } from '@/lib/branch-production-sync';
import { KONDITERKA_CATEGORY_KEYWORDS } from '@/lib/konditerka-catalog';

export interface KonditerkaProductionRow {
    product_id: number;
    product_name: string;
    baked_at_factory: number;
}

const KONDITERKA_WORKSHOP_STORAGE_ID = 48;

function getKyivDate(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
}

function toPositiveInt(value: unknown): number {
    const parsed = Math.trunc(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed;
}

function toSafeNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchKonditerkaTodayProduction(
    supabase: SupabaseClient
): Promise<KonditerkaProductionRow[]> {
    const businessDate = getKyivDate();
    const sync = await syncBranchProductionFromPoster(
        supabase,
        'konditerka1',
        KONDITERKA_WORKSHOP_STORAGE_ID,
        { categoryKeywords: [...KONDITERKA_CATEGORY_KEYWORDS] }
    );

    if (sync.businessDate !== businessDate) {
        return [];
    }

    return sync.items
        .map((item) => ({
            product_id: toPositiveInt(item.product_id),
            product_name: String(item.product_name || '').trim(),
            baked_at_factory: toSafeNumber(item.quantity),
        }))
        .filter((row) => row.product_id > 0 && row.baked_at_factory > 0)
        .sort((a, b) => b.baked_at_factory - a.baked_at_factory);
}
