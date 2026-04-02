import { createServiceRoleClient, fetchBranchRows, type NormalizedDistributionRow } from '@/lib/branch-api';
import { getBulvarUnit } from '@/lib/bulvar-dictionary';

export type BulvarDistributionRow = NormalizedDistributionRow & {
    unit?: string;
};

export async function readBulvarDistributionRows(): Promise<BulvarDistributionRow[]> {
    const supabase = createServiceRoleClient();
    const rows = await fetchBranchRows(
        supabase,
        {
            name: 'bulvar',
            schema: 'bulvar1',
            distributionView: 'v_bulvar_distribution_stats_x3',
            shopParam: 'bulvar',
        },
        'product_id, product_name, spot_name, store_id, spot_id, stock_now, min_stock, avg_sales_day, need_net, baked_at_factory, unit'
    );

    return rows as BulvarDistributionRow[];
}

export function toBulvarOrderRows(rows: BulvarDistributionRow[]) {
    return rows.map((row) => ({
        product_id: row.productId,
        product_name: row.productName,
        spot_name: row.storeName,
        store_id: row.storeId,
        stock_now: row.stockNow,
        min_stock: row.minStock,
        avg_sales_day: row.avgSalesDay,
        need_net: row.needNet,
        baked_at_factory: row.bakedAtFactory,
        unit: getBulvarUnit(row.productName),
    }));
}
