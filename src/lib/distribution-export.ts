import ExcelJS from 'exceljs';

interface GravitonResult {
    "Название продукта": string;
    "Магазин": string;
    "Количество": number;
    "Факт. залишок"?: number | null;
    "Мін. залишок"?: number | null;
    "Сер. продажі"?: number | null;
    "Время расчета"?: string;
}

export const generateDistributionExcel = async (data: any[], unitName: string = 'Гравітон') => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Розподіл');

    // --- HEADER ---
    worksheet.mergeCells('A1:E1'); // Merged A-E for 5 columns
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `РОЗПОДІЛ ПРОДУКЦІЇ (${unitName.toUpperCase()})`;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF00D4FF' } // Brand Blue
    };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 30;

    worksheet.getCell('A3').value = 'Дата формування:';
    worksheet.getCell('B3').value = new Date().toLocaleString('uk-UA');
    worksheet.getCell('A3').font = { bold: true };
    worksheet.getCell('B3').alignment = { horizontal: 'left' };

    // --- TABLE HEADERS ---
    const headerRow = worksheet.getRow(5);
    headerRow.values = ['НАЗВА ПРОДУКТУ', 'ФАКТ. ЗАЛИШОК', 'МІН. ЗАЛИШОК', 'СЕР. ПРОДАЖІ', 'КІЛЬКІСТЬ (кг/шт)'];
    headerRow.height = 20;

    const headerFill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1A1F3A' } // Dark Navy
    } as ExcelJS.Fill;
    const headerFont = { bold: true, color: { argb: 'FFFFFFFF' } };
    const headerAlign = { horizontal: 'center', vertical: 'middle' } as ExcelJS.Alignment;

    [1, 2, 3, 4, 5].forEach(col => {
        const cell = headerRow.getCell(col);
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = headerAlign;
    });

    // --- DATA ---
    let rowIndex = 6;
    let currentStore = '';

    // Sort by Store then Product Name
    const sortedData = [...data].sort((a, b) => {
        const storeA = a['Магазин'] || '';
        const storeB = b['Магазин'] || '';
        const storeComparison = storeA.localeCompare(storeB);
        if (storeComparison !== 0) return storeComparison;
        const nameA = a['Название продукта'] || '';
        const nameB = b['Название продукта'] || '';
        return nameA.localeCompare(nameB);
    });

    sortedData.forEach((item) => {
        // Group Header
        if (item['Магазин'] !== currentStore) {
            if (currentStore !== '') {
                rowIndex++; // Empty row between groups
            }
            currentStore = item['Магазин'];

            const storeRow = worksheet.getRow(rowIndex);
            worksheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
            storeRow.getCell(1).value = currentStore;

            // Store Header Style
            storeRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF000000' } };
            storeRow.getCell(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD9E1F2' } // Light Blue/Gray
            };
            storeRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
            storeRow.height = 25;

            // Borders for store header
            storeRow.getCell(1).border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };

            rowIndex++;
        }

        // Product Row
        const row = worksheet.getRow(rowIndex);
        row.values = [
            item['Название продукта'],
            item['Факт. залишок'] != null ? Number(item['Факт. залишок']).toFixed(2) : '',
            item['Мін. залишок'] != null ? Number(item['Мін. залишок']).toFixed(0) : '',
            item['Сер. продажі'] != null ? Number(item['Сер. продажі']).toFixed(2) : '',
            item['Количество']
        ];

        // Styling
        row.getCell(1).alignment = { horizontal: 'left', indent: 1 };
        row.getCell(2).alignment = { horizontal: 'center' };
        row.getCell(3).alignment = { horizontal: 'center' };
        row.getCell(4).alignment = { horizontal: 'center' };
        row.getCell(5).alignment = { horizontal: 'center' };
        row.getCell(5).font = { bold: true };

        // Borders
        [1, 2, 3, 4, 5].forEach(col => {
            row.getCell(col).border = {
                top: { style: 'thin', color: { argb: 'FFEEEEEE' } },
                left: { style: 'thin', color: { argb: 'FFEEEEEE' } },
                bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } },
                right: { style: 'thin', color: { argb: 'FFEEEEEE' } }
            };
        });

        rowIndex++;
    });

    // --- FOOTER / TOTALS ---
    rowIndex++; // Spacing
    const totalQty = data.reduce((sum, item) => sum + (Number(item['Количество']) || 0), 0);
    const totalRow = worksheet.getRow(rowIndex);
    totalRow.values = ['ВСЬОГО:', '', '', '', totalQty];

    totalRow.getCell(1).font = { bold: true };
    totalRow.getCell(1).alignment = { horizontal: 'right' };

    totalRow.getCell(5).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    totalRow.getCell(5).alignment = { horizontal: 'center' };
    totalRow.getCell(5).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF00D4FF' }
    };

    // --- COLUMNS WIDTH ---
    worksheet.columns = [
        { width: 35 }, // Product
        { width: 18 }, // Stock
        { width: 18 }, // Min Stock
        { width: 18 }, // Sales
        { width: 20 }, // Quantity
    ];

    // --- EXPORT ---
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
    const fileName = `${unitName} - ${formattedDate}.xlsx`;
    link.download = fileName;
    link.click();

    window.URL.revokeObjectURL(url);
};
