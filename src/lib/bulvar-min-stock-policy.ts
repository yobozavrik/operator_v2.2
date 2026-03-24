interface BulvarRawRow {
    avg_sales_day?: number | string | null;
    stock_now?: number | string | null;
    min_stock?: number | string | null;
    need_net?: number | string | null;
    [key: string]: unknown;
}

interface BulvarNormalizedRow {
    avgSalesDay: number;
    stockNow: number;
    minStock: number;
    needNet: number;
}

function toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').trim();
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

export function calcBulvarMinStock(avgSalesDay: number): number {
    const safeAvg = Number.isFinite(avgSalesDay) ? Math.max(0, avgSalesDay) : 0;
    return Math.ceil(safeAvg * 3);
}

export function applyBulvarMinStockPolicyToRawRows<T extends BulvarRawRow>(rows: T[]): T[] {
    return rows.map((row) => {
        const avg = toNumber(row.avg_sales_day);
        const stock = Math.max(0, toNumber(row.stock_now));
        const min = calcBulvarMinStock(avg);
        const need = Math.max(0, min - stock);

        return {
            ...row,
            stock_now: stock,
            min_stock: min,
            need_net: need,
        };
    });
}

export function applyBulvarMinStockPolicyToNormalizedRows<T extends BulvarNormalizedRow>(rows: T[]): T[] {
    return rows.map((row) => {
        const min = calcBulvarMinStock(row.avgSalesDay);
        const stock = Math.max(0, row.stockNow);
        const need = Math.max(0, min - stock);

        return {
            ...row,
            minStock: min,
            needNet: need,
        };
    });
}
