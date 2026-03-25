import ExcelJS from 'exceljs';
import { OrderItem, ProductionOrder } from '@/types/order';

export interface CategoryGroup {
    totalKg: number;
    items: Array<{
        productName: string;
        kg: number;
        minRequired: number;
        maxRecommended: number;
    }>;
}

export const groupItemsByCategory = (items: OrderItem[]) => {
    const groups: Record<string, CategoryGroup> = {};

    items.filter(item => item.kg > 0).forEach(item => {
        const cat = item.category || 'Інше';
        if (!groups[cat]) {
            groups[cat] = {
                totalKg: 0,
                items: []
            };
        }
        groups[cat].totalKg = Number((groups[cat].totalKg + item.kg).toFixed(1));

        // Aggregate by product name
        const existingProduct = groups[cat].items.find(p => p.productName === item.productName);
        if (existingProduct) {
            existingProduct.kg = Number((existingProduct.kg + item.kg).toFixed(1));
            existingProduct.minRequired = Number((existingProduct.minRequired + (item.minRequired || 0)).toFixed(1));
            existingProduct.maxRecommended = Number((existingProduct.maxRecommended + (item.maxRecommended || 0)).toFixed(1));
        } else {
            groups[cat].items.push({
                productName: item.productName,
                kg: item.kg,
                minRequired: item.minRequired || 0,
                maxRecommended: item.maxRecommended || 0
            });
        }
    });

    // Sort items by name within category
    Object.values(groups).forEach(g => {
        g.items.sort((a, b) => a.productName.localeCompare(b.productName));
    });

    return groups;
};

export const prepareWorkbook = async (orderData: ProductionOrder): Promise<ExcelJS.Workbook> => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Замовлення');

    // Заголовок
    worksheet.mergeCells('A1:C1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'ВИРОБНИЧЕ ЗАМОВЛЕННЯ';
    titleCell.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
    };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 35;

    // Інформація
    worksheet.getCell('A3').value = 'Цех:';
    worksheet.getCell('B3').value = 'ГАЛЯ БАЛУВАНА';
    worksheet.getCell('A4').value = 'Дата:';
    worksheet.getCell('B4').value = orderData.date;
    worksheet.getCell('A5').value = 'Загальна вага:';
    worksheet.getCell('B5').value = `${orderData.totalKg} кг`;

    worksheet.getCell('D4').value = '* ПЛАН (ВІД): критичний дефіцит';
    worksheet.getCell('D4').font = { italic: true, size: 9, color: { argb: 'FF808080' } };
    worksheet.getCell('D5').value = '* ПЛАН (ДО): рекомендована норма';
    worksheet.getCell('D5').font = { italic: true, size: 9, color: { argb: 'FF808080' } };

    // Заголовок таблиці
    const headerRow = worksheet.getRow(7);
    headerRow.values = ['КАТЕГОРІЯ', 'ТОВАР', 'ЗАМОВЛЕНО', 'ДІАПАЗОН (ВІД - ДО)'];
    headerRow.height = 25;

    const headerFill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
    } as ExcelJS.Fill;
    const headerFont = { bold: true, color: { argb: 'FFFFFFFF' } };
    const headerAlign = { horizontal: 'center', vertical: 'middle' } as ExcelJS.Alignment;

    [1, 2, 3, 4].forEach(col => {
        const cell = headerRow.getCell(col);
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = headerAlign;
    });

    // Дані
    let rowIndex = 8;
    const groupedByCategory = groupItemsByCategory(orderData.items);
    const categoryColors: Record<string, string> = {
        'ПЕЛЬМЕНІ': 'FFFFE699',
        'ВАРЕНИКИ': 'FFFFC7CE',
        'МЛИНЦІ': 'FFC6E0B4',
        'СИРНИКИ': 'FFB4C7E7',
        'ЧЕБУРЕКИ': 'FFD9D9D9',
        'КОТЛЕТИ': 'FFFFD966',
        'ГОЛУБЦІ': 'FFB7DEE8'
    };

    Object.entries(groupedByCategory).forEach(([category, data]: [string, CategoryGroup]) => {
        const categoryRow = worksheet.getRow(rowIndex);
        categoryRow.values = [category, '', data.totalKg, ''];
        categoryRow.font = { bold: true, size: 12 };

        const fillColor = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: categoryColors[category] || 'FFDDDDDD' }
        } as ExcelJS.Fill;

        [1, 2, 3, 4].forEach(col => {
            categoryRow.getCell(col).fill = fillColor;
        });

        categoryRow.alignment = { horizontal: 'left', vertical: 'middle' };
        categoryRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
        rowIndex++;

        data.items.forEach((item) => {
            const itemRow = worksheet.getRow(rowIndex);
            const range = `${Math.round(item.minRequired)} - ${Math.round(item.maxRecommended)} кг`;
            itemRow.values = ['', item.productName, `${item.kg} кг`, range];
            itemRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
            itemRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
            itemRow.getCell(4).font = { italic: true, color: { argb: 'FF595959' } };
            rowIndex++;
        });

        rowIndex++; // Пустий рядок
    });

    // Підсумки
    const totalRow = worksheet.getRow(rowIndex);
    totalRow.values = ['ВСЬОГО:', '', `${orderData.totalKg} кг`, ''];
    totalRow.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    const totalFillColor = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF203864' }
    } as ExcelJS.Fill;

    [1, 2, 3, 4].forEach(col => {
        totalRow.getCell(col).fill = totalFillColor;
    });

    totalRow.alignment = { horizontal: 'center', vertical: 'middle' };
    totalRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.height = 25;

    // Автоширина
    worksheet.columns = [
        { width: 25 },
        { width: 45 },
        { width: 18 },
        { width: 25 }
    ];

    // Межі (Borders)
    worksheet.eachRow({ includeEmpty: false }, (row: ExcelJS.Row) => {
        if (row.getCell(1).value || row.getCell(2).value || row.getCell(3).value || row.getCell(4).value) {
            row.eachCell((cell: ExcelJS.Cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        }
    });

    return workbook;
};

export const generateExcel = async (orderData: ProductionOrder) => {
    const workbook = await prepareWorkbook(orderData);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = `Graviton_${orderData.date.replace(/\./g, '-')}.xlsx`;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
    return fileName;
};

// --- DISTRIBUTION EXPORT CONTROLLER ---

interface DistributionResult {
    product_name: string;
    spot_name: string;
    quantity_to_ship: number;
    min_stock?: number;
    current_stock?: number;
    avg_sales?: number;
    unit?: string;
    packaging_enabled?: boolean;
    quantity_to_ship_packs_est?: number;
    calc_time?: string;
    created_at?: string;
}

export const generateDistributionExcel = async (data: DistributionResult[], prefix?: string) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Distribution');

    worksheet.mergeCells('A1:G1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = prefix
        ? `DISTRIBUTION REPORT: ${prefix.toUpperCase()}`
        : 'DISTRIBUTION REPORT';
    titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E79' }
    };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 30;

    worksheet.mergeCells('A2:G2');
    const dateCell = worksheet.getCell('A2');
    dateCell.value = `Generated at: ${new Date().toLocaleString('uk-UA')}`;
    dateCell.font = { italic: true, size: 10, color: { argb: 'FF595959' } };
    dateCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const headerRow = worksheet.getRow(4);
    headerRow.values = ['Time', 'Product', 'Current Stock', 'Min Stock', 'Avg Sales', 'To Ship', 'Упак.'];
    headerRow.height = 20;

    const headerStyle = {
        font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF203864' } } as ExcelJS.Fill,
        alignment: { horizontal: 'center', vertical: 'middle' } as ExcelJS.Alignment,
        border: {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        } as ExcelJS.Borders
    };

    [1, 2, 3, 4, 5, 6, 7].forEach((col) => {
        const cell = headerRow.getCell(col);
        cell.font = headerStyle.font;
        cell.fill = headerStyle.fill;
        cell.alignment = headerStyle.alignment;
        cell.border = headerStyle.border;
    });

    let rowIndex = 5;
    const groupedByShop: Record<string, DistributionResult[]> = {};
    data.forEach((item) => {
        if (!groupedByShop[item.spot_name]) groupedByShop[item.spot_name] = [];
        groupedByShop[item.spot_name].push(item);
    });

    const sortedShops = Object.keys(groupedByShop).sort();

    sortedShops.forEach((shopName) => {
        const shopItems = groupedByShop[shopName].sort((a, b) => a.product_name.localeCompare(b.product_name));

        worksheet.mergeCells(`A${rowIndex}:G${rowIndex}`);
        const groupHeader = worksheet.getCell(`A${rowIndex}`);
        groupHeader.value = String(shopName || '').toUpperCase();
        groupHeader.font = { bold: true, size: 11, color: { argb: 'FF000000' } };
        groupHeader.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFDDEBF7' }
        };
        groupHeader.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        groupHeader.border = {
            top: { style: 'medium', color: { argb: 'FF000000' } },
            bottom: { style: 'thin' },
            left: { style: 'thin' },
            right: { style: 'thin' }
        };
        worksheet.getRow(rowIndex).height = 22;
        rowIndex++;

        shopItems.forEach((item, idx) => {
            const excelRow = worksheet.getRow(rowIndex);
            const spot = String(item.spot_name || '').toLowerCase();
            const isWarehouse = spot.includes('остаток на складе') || spot.includes('????');
            const isPackaging = Boolean(item.packaging_enabled);
            const packsToShip = Number(item.quantity_to_ship_packs_est || 0);

            excelRow.values = [
                (item.calc_time || item.created_at)
                    ? new Date(item.calc_time || item.created_at || '').toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
                    : '-',
                item.product_name,
                isWarehouse ? '-' : (item.current_stock === null || item.current_stock === undefined ? '-' : item.current_stock),
                isWarehouse ? '-' : (item.min_stock === null || item.min_stock === undefined ? '-' : item.min_stock),
                isWarehouse ? '-' : (item.avg_sales === null || item.avg_sales === undefined ? '-' : Number(item.avg_sales).toFixed(1)),
                item.quantity_to_ship,
                isWarehouse ? '-' : (isPackaging ? packsToShip : '-')
            ];

            if (idx % 2 !== 0) {
                [1, 2, 3, 4, 5, 6, 7].forEach((col) => {
                    excelRow.getCell(col).fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFAFAFA' }
                    };
                });
            }

            [1, 2, 3, 4, 5, 6, 7].forEach((col) => {
                const cell = excelRow.getCell(col);
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
                };
                if (col === 2) cell.alignment = { horizontal: 'left' };
                else cell.alignment = { horizontal: 'center' };
            });

            excelRow.getCell(6).font = { bold: true };
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
        { width: 10 }
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = prefix ? `${prefix}_${dateStr}.xlsx` : `Distribution_${dateStr}.xlsx`;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
    return fileName;
};

// --- PRODUCTION PLAN EXPORT ---

export interface PlanItem {
    p_day: number;
    p_name: string;
    p_stock: number;
    p_order: number;
    p_min: number;
    p_avg: number;
}

export const generateProductionPlanExcel = async (planData: PlanItem[], daysCount: number) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('План Виробництва');

    // 1. MAIN HEADER
    worksheet.mergeCells('A1:G1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `ПЛАН ВИРОБНИЦТВА НА ${daysCount} ДН(ІВ)`;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E79' } // Dark Blue
    };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 30;

    // 2. METADATA
    worksheet.mergeCells('A2:G2');
    const dateCell = worksheet.getCell('A2');
    dateCell.value = `Згенеровано: ${new Date().toLocaleString('uk-UA')}`;
    dateCell.font = { italic: true, size: 10, color: { argb: 'FF595959' } };
    dateCell.alignment = { horizontal: 'right', vertical: 'middle' };

    // 3. DATA PREPARATION (Sort by Day -> Name)
    const sortedData = [...planData].sort((a, b) => {
        if (Number(a.p_day) !== Number(b.p_day)) return Number(a.p_day) - Number(b.p_day);
        return (a.p_name || '').localeCompare(b.p_name || '');
    });

    const groupedByDay: Record<number, PlanItem[]> = {};
    sortedData.forEach(item => {
        const d = Number(item.p_day);
        if (!groupedByDay[d]) groupedByDay[d] = [];
        groupedByDay[d].push(item);
    });

    let rowIndex = 4;

    Object.keys(groupedByDay).sort((a, b) => Number(a) - Number(b)).forEach(dayKey => {
        const day = Number(dayKey);
        const items = groupedByDay[day];

        // DAY HEADER
        worksheet.mergeCells(`A${rowIndex}:G${rowIndex}`);
        const dayHeader = worksheet.getCell(`A${rowIndex}`);
        dayHeader.value = `ДЕНЬ ${day} (${items.length} ПОЗИЦІЙ)`;
        dayHeader.font = { bold: true, size: 12, color: { argb: 'FF000000' } }; // Black text

        let headerColor = 'FF92D050'; // Green (default / Day 3+)
        if (day === 1) headerColor = 'FFFF0000'; // Red
        if (day === 2) headerColor = 'FFFFC000'; // Yellow

        dayHeader.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: headerColor }
        };
        dayHeader.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        dayHeader.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'medium' }, right: { style: 'medium' } };
        worksheet.getRow(rowIndex).height = 25;
        rowIndex++;

        // TABLE HEADERS
        const headerRow = worksheet.getRow(rowIndex);
        headerRow.values = ['ТОВАР', 'СЕР. ПРОДАЖІ', 'МІН. ЗАЛИШОК', 'ФАКТ', 'ЗАМОВЛЕННЯ', 'РАЗОМ', 'СТАТУС'];

        const headerStyle = {
            font: { bold: true, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF203864' } } as ExcelJS.Fill,
            alignment: { horizontal: 'center', vertical: 'middle' } as ExcelJS.Alignment,
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } as ExcelJS.Borders
        };

        [1, 2, 3, 4, 5, 6, 7].forEach(col => {
            const cell = headerRow.getCell(col);
            cell.font = headerStyle.font;
            cell.fill = headerStyle.fill;
            cell.alignment = headerStyle.alignment;
            cell.border = headerStyle.border;
        });
        rowIndex++;

        // ITEMS
        items.forEach((item, idx) => {
            const row = worksheet.getRow(rowIndex);
            const stock = Number(item.p_stock || 0);
            const order = Number(item.p_order || 0);
            const min = Number(item.p_min || 0);
            const total = stock + order;

            // Status Logic
            let status = 'OK';
            if (total < min) status = 'ДЕФІЦИТ';
            else if (total < min * 1.1) status = 'РИЗИК';

            row.values = [
                item.p_name,
                Number(item.p_avg || 0).toFixed(1),
                min.toFixed(0),
                stock.toFixed(0),
                order.toFixed(0),
                total.toFixed(0),
                status
            ];

            // Styling
            row.getCell(1).alignment = { horizontal: 'left' }; // Name
            [2, 3, 4, 5, 6, 7].forEach(c => row.getCell(c).alignment = { horizontal: 'center' });

            // Highlight Order column
            row.getCell(5).font = { bold: true, color: { argb: 'FF0070C0' } };

            // Status Coloring
            const statusCell = row.getCell(7);
            if (status === 'ДЕФІЦИТ') {
                statusCell.font = { bold: true, color: { argb: 'FFFF0000' } };
            } else if (status === 'РИЗИК') {
                statusCell.font = { bold: true, color: { argb: 'FFED7D31' } }; // Orange
            } else {
                statusCell.font = { color: { argb: 'FF00B050' } }; // Green
            }

            // Zebra striping
            if (idx % 2 !== 0) {
                [1, 2, 3, 4, 5, 6, 7].forEach(col => {
                    const cell = row.getCell(col);
                    // cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } }; // Careful not to overwrite font color? No, fill is compatible.
                    // ExcelJS handles fill and font separately.
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
                });
            }

            // Borders
            [1, 2, 3, 4, 5, 6, 7].forEach(col => {
                row.getCell(col).border = { top: { style: 'thin', color: { argb: 'FFD9D9D9' } }, bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } }, left: { style: 'thin', color: { argb: 'FFD9D9D9' } }, right: { style: 'thin', color: { argb: 'FFD9D9D9' } } };
            });

            rowIndex++;
        });

        rowIndex++; // Spacer
    });

    // COL WIDTHS
    worksheet.columns = [
        { width: 35 }, // Product
        { width: 15 }, // Avg
        { width: 15 }, // Min
        { width: 12 }, // Fact
        { width: 15 }, // Order
        { width: 15 }, // Total
        { width: 15 }, // Status
    ];

    // DOWNLOAD
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = `Production_Plan_${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
    return fileName;
};


