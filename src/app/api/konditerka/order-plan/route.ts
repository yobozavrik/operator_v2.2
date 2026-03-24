import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import {
    buildBranchOrderPlan,
    coercePositiveInt,
    createServiceRoleClient,
} from '@/lib/branch-api';
import { normalizeKonditerkaUnit } from '@/lib/konditerka-dictionary';

export const dynamic = 'force-dynamic';

type ProductUnit = '\u0448\u0442' | '\u043a\u0433';

function normalizeKonditerkaMetrics(
    stock: unknown,
    min: unknown,
    avg: unknown,
    need: unknown,
    unit: ProductUnit
) {
    const multiplier = unit === '\u043a\u0433' ? 0.001 : 1;

    return {
        stock: Math.max(0, Number(stock || 0)) * multiplier,
        min: Math.max(0, Number(min || 0)) * multiplier,
        avg: Math.max(0, Number(avg || 0)) * multiplier,
        need: Math.max(0, Number(need || 0)) * multiplier,
    };
}

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const days = coercePositiveInt(searchParams.get('days'), 1, 1, 30);
        const supabase = createServiceRoleClient();

        const { data: catalogRows, error: catalogError } = await supabase
            .schema('konditerka1')
            .from('production_180d_products')
            .select('product_id, product_name, unit, category_name')
            .not('category_name', 'is', null);

        if (catalogError) {
            return NextResponse.json({ error: catalogError.message }, { status: 500 });
        }

        const validCatalog = (catalogRows || []) as Array<Record<string, unknown>>;
        const productIds = Array.from(
            new Set(
                validCatalog
                    .map((row) => Number(row.product_id))
                    .filter((id) => Number.isFinite(id) && id > 0)
            )
        );

        if (productIds.length === 0) {
            return NextResponse.json([]);
        }

        const unitByProductId = new Map<number, ProductUnit>();
        validCatalog.forEach((row) => {
            const productId = Number(row.product_id);
            if (!Number.isFinite(productId) || productId <= 0) return;
            const productName = String(row.product_name || '').trim();
            const unit = normalizeKonditerkaUnit(row.unit, productName);
            unitByProductId.set(productId, unit);
        });

        const { data: statsRows, error: statsError } = await supabase
            .schema('konditerka1')
            .from('v_konditerka_distribution_stats')
            .select('product_id, product_name, spot_id, spot_name, stock_now, min_stock, avg_sales_day, need_net')
            .in('product_id', productIds);

        if (statsError) {
            return NextResponse.json({ error: statsError.message }, { status: 500 });
        }

        const normalizedRows = ((statsRows || []) as Array<Record<string, unknown>>).map((row) => {
            const productId = Number(row.product_id);
            const productName = String(row.product_name || '').trim();
            const unit =
                unitByProductId.get(productId) ||
                normalizeKonditerkaUnit(undefined, productName);

            const normalized = normalizeKonditerkaMetrics(
                row.stock_now,
                row.min_stock,
                row.avg_sales_day,
                row.need_net,
                unit
            );

            return {
                productId,
                productName,
                storeId: Number(row.spot_id || 0),
                storeName: String(row.spot_name || '').trim(),
                stockNow: normalized.stock,
                minStock: normalized.min,
                avgSalesDay: normalized.avg,
                needNet: normalized.need,
                bakedAtFactory: 0,
                unit,
            };
        }).filter((row) => row.productId > 0 && row.storeId > 0 && row.productName && row.storeName);

        const plan = buildBranchOrderPlan(normalizedRows, days).map((item) => {
            const catalogRow = validCatalog.find((row) => String(row.product_name || '').trim() === item.p_name);
            const unit = catalogRow
                ? normalizeKonditerkaUnit(catalogRow.unit, item.p_name)
                : normalizeKonditerkaUnit(undefined, item.p_name);

            return {
                ...item,
                unit,
            };
        });

        return NextResponse.json(plan);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        Logger.error('[konditerka order-plan] error', { error: message });
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
