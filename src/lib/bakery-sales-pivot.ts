import ExcelJS from 'exceljs';
import { createServiceRoleClient } from '@/lib/branch-api';

const CRAFT_BREAD_CATEGORY_ID = '36';
const CRAFT_BREAD_SHEET = 'Продажі';
const OOS_SHEET = 'OOS на кінець дня';

export type BakerySalesStore = {
    storeId: number;
    storeName: string;
};

export type BakerySalesRow = BakerySalesStore & {
    values: Record<string, number>;
    total: number;
};

export type BakerySalesPivot = {
    startDate: string;
    endDate: string;
    periodLabel: string;
    isSingleDay: boolean;
    breads: string[];
    stores: BakerySalesStore[];
    rows: BakerySalesRow[];
    columnTotals: Record<string, number>;
    grandTotal: number;
    transactionCount: number;
};

export type BakeryOosRow = BakerySalesStore & {
    balances: Record<string, number>;
    totalOos: number;
};

export type BakeryOosPivot = {
    date: string;
    nextSnapshotDate: string;
    periodLabel: string;
    breads: string[];
    stores: BakerySalesStore[];
    rows: BakeryOosRow[];
    breadTotals: Record<string, number>;
    totalOos: number;
    source: 'balance_snapshots' | 'daily_oos' | 'empty';
};

export type BakerySalesWorkbookOptions = {
    oos?: BakeryOosPivot | null;
};

type CatalogProductRow = {
    id: number;
    name: string;
};

type CatalogSpotRow = {
    spot_id: number;
    name: string;
};

type TransactionRow = {
    transaction_id: number;
    spot_id: number | null;
};

type SoldProductRow = {
    transaction_id: number | null;
    spot_id?: number | null;
    product_id: number | null;
    product_name: string | null;
    num: number | string | null;
    discount: number | string | null;
};

type OosSnapshotRow = {
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

function toDateString(date: Date) {
    return date.toISOString().slice(0, 10);
}

function addDaysIso(dateIso: string, days: number) {
    const date = new Date(`${dateIso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return toDateString(date);
}

function startOfUtcDay(dateIso: string) {
    return `${dateIso}T00:00:00Z`;
}

function endOfUtcDay(dateIso: string) {
    return `${addDaysIso(dateIso, 1)}T00:00:00Z`;
}

function safeNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const parsed = Number(value.replace(',', '.').trim());
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function formatDateLabel(iso: string) {
    const [year, month, day] = iso.split('-');
    return `${day}.${month}.${year}`;
}

function buildPeriodLabel(startDate: string, endDate: string) {
    return startDate === endDate
        ? formatDateLabel(startDate)
        : `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`;
}

export function isSingleDayRange(startDate: string, endDate: string) {
    return startDate === endDate;
}

export function buildSalesFileName(startDate: string, endDate: string) {
    return startDate === endDate
        ? `craft_bread_sales_${startDate}.xlsx`
        : `craft_bread_sales_${startDate}_${endDate}.xlsx`;
}

export async function loadCraftBreadSalesPivot(startDate: string, endDate: string): Promise<BakerySalesPivot> {
    const supabase = createServiceRoleClient();
    const periodLabel = buildPeriodLabel(startDate, endDate);
    const rangeStart = startOfUtcDay(startDate);
    const rangeEndExclusive = endOfUtcDay(endDate);

    const [
        { data: productsRaw, error: productsError },
        { data: spotsRaw, error: spotsError },
        { data: transactionsRaw, error: transactionsError },
    ] = await Promise.all([
        supabase
            .schema('categories')
            .from('products')
            .select('id,name')
            .eq('category_id', CRAFT_BREAD_CATEGORY_ID)
            .order('name'),
        supabase
            .schema('categories')
            .from('spots')
            .select('spot_id,name')
            .order('name'),
        supabase
            .schema('categories')
            .from('transactions')
            .select('transaction_id,spot_id,date_close_date')
            .gte('date_close_date', rangeStart)
            .lt('date_close_date', rangeEndExclusive),
    ]);

    if (productsError) throw new Error(`Failed to load bakery products: ${productsError.message}`);
    if (spotsError) throw new Error(`Failed to load bakery spots: ${spotsError.message}`);
    if (transactionsError) throw new Error(`Failed to load bakery transactions: ${transactionsError.message}`);

    const products = ((productsRaw || []) as CatalogProductRow[]).filter((row) => row.id > 0 && row.name.trim());
    const spots = ((spotsRaw || []) as CatalogSpotRow[]).filter((row) => row.spot_id > 0 && row.name.trim());
    const transactions = ((transactionsRaw || []) as TransactionRow[]).filter((row) => row.transaction_id > 0);

    const productIds = products.map((row) => row.id);
    const productNames = products.map((row) => row.name);
    const spotMap = new Map<number, string>(spots.map((row) => [row.spot_id, row.name.trim()]));
    const transactionSpotMap = new Map<number, number>();

    transactions.forEach((row) => {
        if (row.spot_id && row.spot_id > 0) {
            transactionSpotMap.set(row.transaction_id, row.spot_id);
        }
    });

    let soldRows: SoldProductRow[] = [];
    if (productIds.length > 0) {
        const { data: soldRaw, error: soldError } = await supabase
            .schema('categories')
            .from('sold_products_detailed')
            .select('transaction_id,product_id,product_name,num,discount,sales_time')
            .gte('sales_time', rangeStart)
            .lt('sales_time', rangeEndExclusive)
            .eq('discount', 0)
            .in('product_id', productIds);

        if (soldError) {
            throw new Error(`Failed to load bakery sales: ${soldError.message}`);
        }

        soldRows = (soldRaw || []) as SoldProductRow[];
    }

    const rowsByStore = new Map<number, Map<string, number>>();
    const storeTotals = new Map<number, number>();
    const columnTotals = new Map<string, number>();
    let transactionCount = 0;

    for (const row of soldRows) {
        const productName = String(row.product_name || '').trim();
        if (!productName) continue;

        const productNameMatch = productNames.includes(productName) ? productName : null;
        if (!productNameMatch) continue;

        const transactionId = Number(row.transaction_id || 0);
        const storeId = Number(row.spot_id || (transactionId > 0 ? transactionSpotMap.get(transactionId) || 0 : 0));
        if (!storeId) continue;

        transactionCount += 1;
        const qty = safeNumber(row.num);
        const currentRow = rowsByStore.get(storeId) ?? new Map<string, number>();
        currentRow.set(productNameMatch, (currentRow.get(productNameMatch) || 0) + qty);
        rowsByStore.set(storeId, currentRow);

        storeTotals.set(storeId, (storeTotals.get(storeId) || 0) + qty);
        columnTotals.set(productNameMatch, (columnTotals.get(productNameMatch) || 0) + qty);
    }

    const stores: BakerySalesStore[] = spots.map((spot) => ({
        storeId: spot.spot_id,
        storeName: spot.name.trim(),
    }));

    const rows: BakerySalesRow[] = stores
        .map((store) => {
            const values: Record<string, number> = {};
            for (const bread of productNames) values[bread] = 0;

            const rowData = rowsByStore.get(store.storeId);
            if (rowData) {
                for (const [bread, qty] of rowData.entries()) {
                    values[bread] = qty;
                }
            }

            return {
                ...store,
                values,
                total: storeTotals.get(store.storeId) || 0,
            };
        })
        .sort((a, b) => b.total - a.total || a.storeName.localeCompare(b.storeName));

    const breads = productNames.sort((a, b) => {
        const totalDiff = (columnTotals.get(b) || 0) - (columnTotals.get(a) || 0);
        return totalDiff || a.localeCompare(b);
    });

    const orderedRows = rows.map((row) => {
        const orderedValues: Record<string, number> = {};
        for (const bread of breads) orderedValues[bread] = row.values[bread] || 0;
        return { ...row, values: orderedValues };
    });

    const grandTotal = orderedRows.reduce((sum, row) => sum + row.total, 0);
    const orderedColumnTotals: Record<string, number> = {};
    for (const bread of breads) orderedColumnTotals[bread] = columnTotals.get(bread) || 0;

    return {
        startDate,
        endDate,
        periodLabel,
        isSingleDay: isSingleDayRange(startDate, endDate),
        breads,
        stores,
        rows: orderedRows,
        columnTotals: orderedColumnTotals,
        grandTotal,
        transactionCount,
    };
}

export async function buildCraftBreadSalesWorkbook(
    pivot: BakerySalesPivot,
    options: BakerySalesWorkbookOptions = {}
) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Operator Bakery';
    workbook.created = new Date();

    addSalesSheet(workbook, pivot);

    if (pivot.isSingleDay && options.oos) {
        addOosSheet(workbook, options.oos);
    }

    return workbook.xlsx.writeBuffer();
}

function addSalesSheet(workbook: ExcelJS.Workbook, pivot: BakerySalesPivot) {
    const sheet = workbook.addWorksheet(CRAFT_BREAD_SHEET, {
        views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }],
    });

    const colCount = pivot.breads.length + 2;
    sheet.mergeCells(1, 1, 1, colCount);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = `КРАФТОВИЙ ХЛІБ — ПИВОТ ПО ПРОДАЖАХ`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    sheet.mergeCells(2, 1, 2, colCount);
    const periodCell = sheet.getCell(2, 1);
    periodCell.value = `Період: ${pivot.periodLabel}`;
    periodCell.font = { italic: true, size: 10, color: { argb: 'FF595959' } };
    periodCell.alignment = { horizontal: 'right', vertical: 'middle' };
    sheet.getRow(2).height = 20;

    const headerRow = sheet.getRow(3);
    headerRow.height = 24;
    setHeader(headerRow.getCell(1), 'Магазин');
    pivot.breads.forEach((bread, index) => setHeader(headerRow.getCell(index + 2), bread));
    setHeader(headerRow.getCell(colCount), 'РАЗОМ');

    pivot.rows.forEach((row, idx) => {
        const excelRow = sheet.getRow(idx + 4);
        excelRow.height = 20;
        const alt = idx % 2 === 1;

        const label = excelRow.getCell(1);
        label.value = row.storeName;
        label.font = { bold: true, size: 10 };
        label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: alt ? 'FFF6F8FA' : 'FFFFFFFF' } };
        label.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        label.border = thinBorder('FFD9E2EC');
        pivot.breads.forEach((bread, colIdx) => {
            const cell = excelRow.getCell(colIdx + 2);
            const value = row.values[bread] || 0;
            cell.value = value;
            cell.numFmt = '0';
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = thinBorder('FFD9E2EC');
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: value > 0 ? 'FFE8FFF1' : alt ? 'FFF6F8FA' : 'FFFFFFFF' },
            };
        });

        const totalCell = excelRow.getCell(colCount);
        totalCell.value = row.total;
        totalCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B80FF' } };
        totalCell.alignment = { horizontal: 'center', vertical: 'middle' };
        totalCell.border = thinBorder('FF1F5CC8');
    });

    const totalsRow = sheet.getRow(pivot.rows.length + 4);
    totalsRow.height = 22;
    const totalsLabel = totalsRow.getCell(1);
    totalsLabel.value = 'РАЗОМ';
    totalsLabel.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    totalsLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    totalsLabel.alignment = { horizontal: 'center', vertical: 'middle' };
    totalsLabel.border = thinBorder('FF1F5CC8');

    pivot.breads.forEach((bread, colIdx) => {
        const cell = totalsRow.getCell(colIdx + 2);
        cell.value = pivot.columnTotals[bread] || 0;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B80FF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thinBorder('FF1F5CC8');
    });

    const grandCell = totalsRow.getCell(colCount);
    grandCell.value = pivot.grandTotal;
    grandCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    grandCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    grandCell.alignment = { horizontal: 'center', vertical: 'middle' };
    grandCell.border = thinBorder('FF1F5CC8');

    sheet.getColumn(1).width = 24;
    pivot.breads.forEach((_, index) => {
        sheet.getColumn(index + 2).width = 14;
    });
    sheet.getColumn(colCount).width = 12;
}

function addOosSheet(workbook: ExcelJS.Workbook, pivot: BakeryOosPivot) {
    const sheet = workbook.addWorksheet(OOS_SHEET, {
        views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }],
    });

    const colCount = pivot.breads.length + 2;
    sheet.mergeCells(1, 1, 1, colCount);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = `OOS НА КІНЕЦЬ ДНЯ — ${formatDateLabel(pivot.date)}`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    sheet.mergeCells(2, 1, 2, colCount);
    const periodCell = sheet.getCell(2, 1);
    periodCell.value = `Джерело: ${pivot.source === 'balance_snapshots' ? 'balance_snapshots' : 'daily_oos'} | Знімок наступного ранку: ${formatDateLabel(pivot.nextSnapshotDate)}`;
    periodCell.font = { italic: true, size: 10, color: { argb: 'FF595959' } };
    periodCell.alignment = { horizontal: 'right', vertical: 'middle' };
    sheet.getRow(2).height = 20;

    const headerRow = sheet.getRow(3);
    setHeader(headerRow.getCell(1), 'Магазин');
    pivot.breads.forEach((bread, index) => setHeader(headerRow.getCell(index + 2), bread));
    setHeader(headerRow.getCell(colCount), 'OOS');

    pivot.rows.forEach((row, idx) => {
        const excelRow = sheet.getRow(idx + 4);
        const alt = idx % 2 === 1;

        const label = excelRow.getCell(1);
        label.value = row.storeName;
        label.font = { bold: true, size: 10 };
        label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: alt ? 'FFF6F8FA' : 'FFFFFFFF' } };
        label.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        label.border = thinBorder('FFD9E2EC');

        pivot.breads.forEach((bread, colIdx) => {
            const value = row.balances[bread] ?? -1;
            const cell = excelRow.getCell(colIdx + 2);
            cell.value = value;
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = thinBorder('FFD9E2EC');
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: value === 0 ? 'FFFFE8E8' : value > 0 ? 'FFE8FFF1' : alt ? 'FFF6F8FA' : 'FFFFFFFF' },
            };
        });

        const oosCell = excelRow.getCell(colCount);
        oosCell.value = row.totalOos;
        oosCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        oosCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE74C3C' } };
        oosCell.alignment = { horizontal: 'center', vertical: 'middle' };
        oosCell.border = thinBorder('FFC0392B');
    });

    const totalsRow = sheet.getRow(pivot.rows.length + 4);
    const totalsLabel = totalsRow.getCell(1);
    totalsLabel.value = 'OOS';
    totalsLabel.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    totalsLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    totalsLabel.alignment = { horizontal: 'center', vertical: 'middle' };
    totalsLabel.border = thinBorder('FF1F5CC8');

    pivot.breads.forEach((bread, colIdx) => {
        const cell = totalsRow.getCell(colIdx + 2);
        cell.value = pivot.breadTotals[bread] || 0;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE74C3C' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thinBorder('FFC0392B');
    });

    const totalCell = totalsRow.getCell(colCount);
    totalCell.value = pivot.totalOos;
    totalCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    totalCell.alignment = { horizontal: 'center', vertical: 'middle' };
    totalCell.border = thinBorder('FF1F5CC8');

    sheet.getColumn(1).width = 24;
    pivot.breads.forEach((_, index) => {
        sheet.getColumn(index + 2).width = 14;
    });
    sheet.getColumn(colCount).width = 12;
}

function setHeader(cell: ExcelJS.Cell, value: string) {
    cell.value = value;
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder('FF1F5CC8');
}

function thinBorder(argb: string): Partial<ExcelJS.Borders> {
    const side = { style: 'thin' as const, color: { argb } };
    return { top: side, bottom: side, left: side, right: side };
}

export function buildCraftBreadOosFromRows(
    date: string,
    rows: OosSnapshotRow[] | DailyOosRow[],
    breads: string[],
    stores: BakerySalesStore[],
    source: BakeryOosPivot['source']
): BakeryOosPivot {
    const matrix = new Map<number, Map<string, number>>();

    for (const store of stores) {
        matrix.set(store.storeId, new Map<string, number>());
    }

    for (const row of rows) {
        const storeId = Number(row.spot_id || 0);
        const breadName = String(row.product_name || '').trim();
        if (!storeId || !breadName) continue;

        const currentStore = matrix.get(storeId) ?? new Map<string, number>();
        let balance = 0;
        if ('balance_qty' in row) {
            balance = row.balance_qty === null || row.balance_qty === undefined ? -1 : safeNumber(row.balance_qty);
        } else {
            if (row.oos_final) {
                balance = 0;
            } else if (row.evening_balance === null || row.evening_balance === undefined) {
                balance = -1;
            } else {
                balance = safeNumber(row.evening_balance);
            }
        }
        currentStore.set(breadName, balance);
        matrix.set(storeId, currentStore);
    }

    const breadTotals: Record<string, number> = {};
    breads.forEach((bread) => {
        breadTotals[bread] = 0;
    });

    const normalizedRows: BakeryOosRow[] = stores.map((store) => {
        const balances: Record<string, number> = {};
        for (const bread of breads) balances[bread] = -1;

        const storeMatrix = matrix.get(store.storeId);
        let totalOos = 0;
        if (storeMatrix) {
            for (const [bread, balance] of storeMatrix.entries()) {
                balances[bread] = balance;
            }
        }

        for (const bread of breads) {
            if ((balances[bread] ?? -1) === 0) {
                breadTotals[bread] += 1;
                totalOos += 1;
            }
        }

        return { ...store, balances, totalOos };
    });

    return {
        date,
        nextSnapshotDate: addDaysIso(date, 1),
        periodLabel: formatDateLabel(date),
        breads,
        stores,
        rows: normalizedRows,
        breadTotals,
        totalOos: normalizedRows.reduce((sum, row) => sum + row.totalOos, 0),
        source,
    };
}

export async function loadCraftBreadCatalog() {
    const supabase = createServiceRoleClient();
    const [{ data: productsRaw, error: productsError }, { data: spotsRaw, error: spotsError }] = await Promise.all([
        supabase
            .schema('categories')
            .from('products')
            .select('id,name')
            .eq('category_id', CRAFT_BREAD_CATEGORY_ID)
            .order('name'),
        supabase.schema('categories').from('spots').select('spot_id,name').order('name'),
    ]);

    if (productsError) throw new Error(`Failed to load bakery products: ${productsError.message}`);
    if (spotsError) throw new Error(`Failed to load bakery spots: ${spotsError.message}`);

    const breads = ((productsRaw || []) as CatalogProductRow[])
        .map((row) => row.name.trim())
        .filter(Boolean);
    const stores = ((spotsRaw || []) as CatalogSpotRow[])
        .filter((row) => row.spot_id > 0 && row.name.trim())
        .map((row) => ({ storeId: row.spot_id, storeName: row.name.trim() }));

    return { breads, stores };
}
