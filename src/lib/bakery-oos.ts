import { createServiceRoleClient } from '@/lib/branch-api';
import {
    BakeryOosPivot,
    BakerySalesStore,
    buildCraftBreadOosFromRows,
    loadCraftBreadCatalog,
} from '@/lib/bakery-sales-pivot';

type SnapshotRow = {
    spot_id: number;
    product_name: string;
    balance_qty: number | string | null;
};

type DailyOosRow = {
    spot_id: number;
    product_name: string;
    evening_balance: number | string | null;
    oos_final: boolean | number | string | null;
};

function addDaysIso(dateIso: string, days: number) {
    const date = new Date(`${dateIso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function startOfUtcDay(dateIso: string) {
    return `${dateIso}T00:00:00Z`;
}

function endOfUtcDay(dateIso: string) {
    return `${addDaysIso(dateIso, 1)}T00:00:00Z`;
}

export async function loadCraftBreadEodOos(date: string): Promise<BakeryOosPivot> {
    const supabase = createServiceRoleClient();
    const catalog = await loadCraftBreadCatalog();
    const nextSnapshotDate = addDaysIso(date, 1);
    const rangeStart = startOfUtcDay(nextSnapshotDate);
    const rangeEnd = endOfUtcDay(nextSnapshotDate);

    const [{ data: snapshotRows, error: snapshotError }, { data: dailyRows, error: dailyError }] =
        await Promise.all([
            supabase
                .schema('bakery1')
                .from('balance_snapshots')
                .select('spot_id,product_name,balance_qty,snapshot_type,snapshot_time')
                .eq('snapshot_type', 'morning')
                .gte('snapshot_time', rangeStart)
                .lt('snapshot_time', rangeEnd)
                .order('spot_id')
                .order('product_name'),
            supabase
                .schema('bakery1')
                .from('daily_oos')
                .select('spot_id,product_name,evening_balance,oos_final')
                .eq('date', date)
                .order('spot_id')
                .order('product_name'),
        ]);

    if (snapshotError) {
        throw new Error(`Failed to load bakery balance snapshots: ${snapshotError.message}`);
    }
    if (dailyError) {
        throw new Error(`Failed to load bakery daily OOS: ${dailyError.message}`);
    }

    const snapshotData = ((snapshotRows || []) as SnapshotRow[]).filter((row) => row.spot_id > 0 && row.product_name);
    const dailyData = ((dailyRows || []) as DailyOosRow[]).filter((row) => row.spot_id > 0 && row.product_name);

    const source = snapshotData.length > 0 ? 'balance_snapshots' : dailyData.length > 0 ? 'daily_oos' : 'empty';
    const rows = snapshotData.length > 0 ? snapshotData : dailyData;

    const pivot = buildCraftBreadOosFromRows(
        date,
        rows,
        catalog.breads,
        catalog.stores as BakerySalesStore[],
        source
    );

    return pivot;
}

