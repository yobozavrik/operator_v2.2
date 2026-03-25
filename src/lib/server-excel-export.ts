import ExcelJS from 'exceljs';

export interface ServerDistributionRow {
    product_name: string;
    spot_name: string;
    quantity_to_ship: number;
    min_stock?: number | null;
    current_stock?: number | null;
    avg_sales?: number | null;
    unit?: string;
    packaging_enabled?: boolean;
    quantity_to_ship_packs_est?: number;
    calc_time?: string;
    created_at?: string;
}

function buildDistributionWorkbook(
    data: ServerDistributionRow[],
    prefix?: string
): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Distribution');
    worksheet.mergeCells('A1:H1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = prefix
        ? `DISTRIBUTION REPORT: ${prefix.toUpperCase()}`
        : 'DISTRIBUTION REPORT';
    titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E79' },
    };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 30;
    worksheet.mergeCells('A2:H2');
    const dateCell = worksheet.getCell('A2');
    dateCell.value = `Generated at: ${new Date().toLocaleString('uk-UA')}`;
    dateCell.font = { italic: true, size: 10, color: { argb: 'FF595959' } };
    dateCell.alignment = { horizontal: 'right', vertical: 'middle' };
    const isKgUnit = (value: unknown): boolean => {
        const unit = String(value || '').trim().toLowerCase();
        return unit === 'kg' || unit === 'кг';
    };
    const formatKg = (value: unknown): string => {
        const num = Number(value || 0);
        if (!Number.isFinite(num)) return '-';
        return num.toFixed(3).replace(/\.?0+$/, '');
    };
    const headerRow = worksheet.getRow(4);
    headerRow.values = ['Час', 'Продукт', 'Пот. залишок', 'Мін. залишок', 'Сер. продажі', 'До відванж.', 'До відванж. (кг)', 'Упак.'];
    headerRow.height = 20;
    const headerStyle = {
        font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF203864' } } as ExcelJS.Fill,
        alignment: { horizontal: 'center', vertical: 'middle' } as ExcelJS.Alignment,
        border: {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
        } as ExcelJS.Borders,
    };
    [1, 2, 3, 4, 5, 6, 7, 8].forEach((col) => {
        const cell = headerRow.getCell(col);
        cell.font = headerStyle.font;
        cell.fill = headerStyle.fill;
        cell.alignment = headerStyle.alignment;
        cell.border = headerStyle.border;
    });
    let rowIndex = 5;
    const groupedByShop: Record<string, ServerDistributionRow[]> = {};
    data.forEach((item) => {
        if (!groupedByShop[item.spot_name]) groupedByShop[item.spot_name] = [];
        groupedByShop[item.spot_name].push(item);
    });
    const sortedShops = Object.keys(groupedByShop).sort();
    sortedShops.forEach((shopName) => {
        const shopItems = groupedByShop[shopName].sort((a, b) => a.product_name.localeCompare(b.product_name));
        worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
        const groupHeader = worksheet.getCell(`A${rowIndex}`);
        groupHeader.value = String(shopName || '').toUpperCase();
        groupHeader.font = { bold: true, size: 11, color: { argb: 'FF000000' } };
        groupHeader.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFDDEBF7' },
        };
        groupHeader.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        groupHeader.border = {
            top: { style: 'medium', color: { argb: 'FF000000' } },
            bottom: { style: 'thin' },
            left: { style: 'thin' },
            right: { style: 'thin' },
        };
        worksheet.getRow(rowIndex).height = 22;
        rowIndex++;
        shopItems.forEach((item, idx) => {
            const excelRow = worksheet.getRow(rowIndex);
            const spot = String(item.spot_name || '').toLowerCase();
            const isWarehouse =
                spot.includes('остаток на складе') ||
                spot.includes('РѕСЃС‚Р°С‚РѕРє РЅР° СЃРєР»Р°РґРµ') ||
                spot.includes('????');
            const isPackaging = Boolean(item.packaging_enabled);
            const packsToShip = Number(item.quantity_to_ship_packs_est || 0);
            const qtyKg = isKgUnit(item.unit) || isPackaging ? formatKg(item.quantity_to_ship) : '-';
            excelRow.values = [
                (item.calc_time || item.created_at)
                    ? new Date(item.calc_time || item.created_at || '').toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
                    : '-',
                item.product_name,
                isWarehouse ? '-' : (item.current_stock === null || item.current_stock === undefined ? '-' : item.current_stock),
                isWarehouse ? '-' : (item.min_stock === null || item.min_stock === undefined ? '-' : item.min_stock),
                isWarehouse ? '-' : (item.avg_sales === null || item.avg_sales === undefined ? '-' : Number(item.avg_sales).toFixed(1)),
                item.quantity_to_ship,
                isWarehouse ? '-' : qtyKg,
                isWarehouse ? '-' : (isPackaging ? packsToShip : '-'),
            ];
            if (idx % 2 !== 0) {
                [1, 2, 3, 4, 5, 6, 7, 8].forEach((col) => {
                    excelRow.getCell(col).fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFAFAFA' },
                    };
                });
            }
            [1, 2, 3, 4, 5, 6, 7, 8].forEach((col) => {
                const cell = excelRow.getCell(col);
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                };
                if (col === 2) cell.alignment = { horizontal: 'left' };
                else cell.alignment = { horizontal: 'center' };
            });
            excelRow.getCell(6).font = { bold: true };
            excelRow.getCell(7).font = { bold: true, color: { argb: 'FF1F4E79' } };
            rowIndex++;
        });
    });
    worksheet.columns = [
        { width: 10 },
        { width: 40 },
        { width: 15 },
        { width: 15 },
        { width: 15 },
        { width: 15 },
        { width: 15 },
        { width: 10 },
    ];
    return workbook;
}

export async function buildDistributionExcelBuffer(
    unitName: string,
    _businessDate: string,
    data: ServerDistributionRow[]
): Promise<Buffer> {
    const workbook = buildDistributionWorkbook(data, unitName);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
}

