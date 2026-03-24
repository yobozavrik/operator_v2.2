import ExcelJS from 'exceljs';

export interface ForecastRow {
    store_id: number;
    sku_id: number;
    predicted_demand: number;
    oos_correction: number;
    production_order: number;
    final_distribution: number;
}

export interface StoreInfo  { id: number; name: string }
export interface SkuInfo    { id: number; name: string }

// Colors matching the TZ spec
const NAVY   = 'FF1F3864'; // #1F3864 — header background
const BLUE   = 'FF2E75B6'; // #2E75B6 — totals accent
const OOS    = 'FFFFC000'; // amber — OOS correction indicator
const WHITE  = 'FFFFFFFF';
const LIGHT  = 'FFD9E1F2'; // light blue-gray for alternating

export async function generateBakeryForecastExcel(
    date: string,
    forecasts: ForecastRow[],
    stores: StoreInfo[],
    skus: SkuInfo[],
) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Крафтова пекарня — ERP';
    const ws = workbook.addWorksheet('Розподіл', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] });

    const colCount = skus.length + 2; // store name + SKU cols + total col

    // ─── Row 1: Title ───────────────────────────────────────────────────────────
    ws.mergeCells(1, 1, 1, colCount);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = `КРАФТОВА ПЕКАРНЯ — ПЛАН РОЗПОДІЛУ НА ${formatDate(date)}`;
    titleCell.font   = { bold: true, size: 14, color: { argb: WHITE } };
    titleCell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 32;

    // ─── Row 2: Generated at ────────────────────────────────────────────────────
    ws.mergeCells(2, 1, 2, colCount);
    const genCell = ws.getCell(2, 1);
    genCell.value = `Сформовано: ${new Date().toLocaleString('uk-UA')}`;
    genCell.font  = { italic: true, size: 10, color: { argb: 'FF595959' } };
    genCell.alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getRow(2).height = 18;

    // ─── Row 3: Column headers ──────────────────────────────────────────────────
    const headerRow = ws.getRow(3);
    headerRow.height = 40;

    const setHeaderCell = (col: number, value: string) => {
        const cell = headerRow.getCell(col);
        cell.value = value;
        cell.font  = { bold: true, size: 10, color: { argb: WHITE } };
        cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FF3A5070' } },
            bottom: { style: 'thin', color: { argb: 'FF3A5070' } },
            left: { style: 'thin', color: { argb: 'FF3A5070' } },
            right: { style: 'thin', color: { argb: 'FF3A5070' } },
        };
    };

    setHeaderCell(1, 'Магазин');
    skus.forEach((sku, i) => setHeaderCell(i + 2, sku.name));
    setHeaderCell(colCount, 'ВСЬОГО');

    // ─── Build lookup map ────────────────────────────────────────────────────────
    // key: `${store_id}_${sku_id}` → ForecastRow
    const cellMap = new Map<string, ForecastRow>();
    for (const f of forecasts) {
        cellMap.set(`${f.store_id}_${f.sku_id}`, f);
    }

    // ─── Data rows ───────────────────────────────────────────────────────────────
    stores.forEach((store, rowIdx) => {
        const rowNum = rowIdx + 4;
        const dataRow = ws.getRow(rowNum);
        dataRow.height = 20;

        const isAlt = rowIdx % 2 === 1;

        // Store name cell
        const storeCell = dataRow.getCell(1);
        storeCell.value = store.name;
        storeCell.font  = { bold: true, size: 10 };
        storeCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? LIGHT : WHITE } };
        storeCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        storeCell.border = thinBorder('FF888888');

        let rowTotal = 0;

        skus.forEach((sku, colIdx) => {
            const key = `${store.id}_${sku.id}`;
            const fc  = cellMap.get(key);
            const val = fc?.final_distribution ?? 0;
            rowTotal += val;

            const cell = dataRow.getCell(colIdx + 2);
            cell.value = val;
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = thinBorder('FFB8C4D0');

            if (fc && fc.oos_correction > 0) {
                // OOS correction — amber highlight
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: OOS } };
                cell.note = {
                    texts: [
                        { font: { bold: true }, text: '⚠ Коригування OOS\n' },
                        { text: `Чистий прогноз: ${fc.predicted_demand.toFixed(1)}\nOOS за 3 тижні: ${fc.oos_count}\nПоправка: +${fc.oos_correction}` },
                    ],
                };
            } else {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? LIGHT : WHITE } };
                if (fc && fc.predicted_demand > 0) {
                    cell.note = {
                        texts: [{ text: `Прогноз: ${fc.predicted_demand.toFixed(1)}` }],
                    };
                }
            }
        });

        // Row total
        const totalCell = dataRow.getCell(colCount);
        totalCell.value = rowTotal;
        totalCell.font  = { bold: true, color: { argb: WHITE } };
        totalCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
        totalCell.alignment = { horizontal: 'center', vertical: 'middle' };
        totalCell.border = thinBorder('FF1A4A80');
    });

    // ─── Column totals row ───────────────────────────────────────────────────────
    const totalsRowNum = stores.length + 4;
    const totalsRow = ws.getRow(totalsRowNum);
    totalsRow.height = 24;

    const totLabelCell = totalsRow.getCell(1);
    totLabelCell.value = 'ВСЬОГО ВИРОБИТИ';
    totLabelCell.font  = { bold: true, size: 10, color: { argb: WHITE } };
    totLabelCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    totLabelCell.alignment = { horizontal: 'center', vertical: 'middle' };
    totLabelCell.border = thinBorder('FF1A4A80');

    let grandTotal = 0;
    skus.forEach((sku, colIdx) => {
        const colTotal = stores.reduce((sum, store) => {
            const fc = cellMap.get(`${store.id}_${sku.id}`);
            return sum + (fc?.final_distribution ?? 0);
        }, 0);
        grandTotal += colTotal;

        const cell = totalsRow.getCell(colIdx + 2);
        cell.value = colTotal;
        cell.font  = { bold: true, color: { argb: WHITE } };
        cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thinBorder('FF1A4A80');
    });

    // Grand total
    const grandCell = totalsRow.getCell(colCount);
    grandCell.value = grandTotal;
    grandCell.font  = { bold: true, size: 12, color: { argb: WHITE } };
    grandCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    grandCell.alignment = { horizontal: 'center', vertical: 'middle' };
    grandCell.border = thinBorder('FF1A4A80');

    // ─── Column widths ───────────────────────────────────────────────────────────
    ws.getColumn(1).width = 22; // store names
    skus.forEach((_, i) => { ws.getColumn(i + 2).width = 14; });
    ws.getColumn(colCount).width = 12; // totals

    // ─── Export ──────────────────────────────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();
    const blob   = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href  = url;
    link.download = `Крафтова пекарня — Розподіл ${date}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
}

function formatDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
}

function thinBorder(argb: string): Partial<ExcelJS.Borders> {
    const s = { style: 'thin' as const, color: { argb } };
    return { top: s, bottom: s, left: s, right: s };
}
