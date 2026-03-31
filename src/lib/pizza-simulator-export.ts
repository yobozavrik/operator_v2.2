import ExcelJS from 'exceljs';

export interface PizzaSimulatorPlanItem {
    plan_day: number;
    product_name: string;
    quantity: number;
}

const DAY_FILL_BY_SLOT: Record<number, string> = {
    1: 'FFFF0000',
    2: 'FFFFFF00',
    0: 'FF92D050'
};

function getDayFill(day: number): string {
    return DAY_FILL_BY_SLOT[day % 3] || 'FF92D050';
}

function buildFileName(days: number, capacity: number): string {
    const date = new Date().toISOString().slice(0, 10);
    return `Plan_Vyrobnytstva_${days}d_${capacity}cap_${date}.xlsx`;
}

function getPlanDateByDay(day: number): Date {
    const planDate = new Date();
    planDate.setHours(0, 0, 0, 0);
    planDate.setDate(planDate.getDate() + day);
    return planDate;
}

function formatPlanDate(date: Date): string {
    return date.toLocaleDateString('uk-UA');
}

function normalizeDayBlocks(planData: PizzaSimulatorPlanItem[], days: number) {
    return Array.from({ length: days }, (_, index) => index + 1).map((day) => {
        const items = planData
            .filter((item) => Number(item.plan_day) === day)
            .sort((a, b) => {
                if (Number(b.quantity) !== Number(a.quantity)) {
                    return Number(b.quantity) - Number(a.quantity);
                }

                return (a.product_name || '').localeCompare(b.product_name || '');
            });

        return {
            day,
            items,
            totalQty: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
        };
    });
}

export async function generatePizzaSimulatorExcel(
    planData: PizzaSimulatorPlanItem[],
    days: number,
    capacity: number
) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('План виробництва');
    const groupedByDay = normalizeDayBlocks(planData, days);
    const firstPlanDate = formatPlanDate(getPlanDateByDay(1));
    const lastPlanDate = formatPlanDate(getPlanDateByDay(days));

    worksheet.columns = [
        { width: 8 },
        { width: 26 },
        { width: 26 },
        { width: 10 },
        { width: 4 },
        { width: 8 },
        { width: 26 },
        { width: 26 },
        { width: 10 }
    ];

    worksheet.getCell('A1').value = `План виробництва піци на ${days} дн. / ${capacity} шт`;
    worksheet.mergeCells('A1:I1');
    worksheet.getCell('A1').font = { bold: true, size: 14 };
    worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 24;

    worksheet.getCell('A2').value = `Період: ${firstPlanDate} - ${lastPlanDate}`;
    worksheet.mergeCells('A2:I2');
    worksheet.getCell('A2').font = { bold: true, size: 10, color: { argb: 'FF666666' } };
    worksheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.getCell('A3').value = `Згенеровано: ${new Date().toLocaleString('uk-UA')}`;
    worksheet.mergeCells('A3:I3');
    worksheet.getCell('A3').font = { italic: true, size: 10, color: { argb: 'FF666666' } };
    worksheet.getCell('A3').alignment = { horizontal: 'right', vertical: 'middle' };

    const leftBlockCols = { day: 1, nameStart: 2, nameEnd: 3, qty: 4 };
    const rightBlockCols = { day: 6, nameStart: 7, nameEnd: 8, qty: 9 };
    const startRow = 5;
    const rowStride = 11;
    const leftColumnDays = groupedByDay.filter((block) => block.day <= 3);
    const rightColumnDays = groupedByDay.filter((block) => block.day > 3);

    for (let index = 0; index < Math.max(leftColumnDays.length, rightColumnDays.length); index++) {
        const topRow = startRow + index * rowStride;
        const leftBlock = leftColumnDays[index];
        const rightBlock = rightColumnDays[index];

        if (leftBlock) {
            writeDayBlock(worksheet, topRow, leftBlockCols, leftBlock);
        }

        if (rightBlock) {
            writeDayBlock(worksheet, topRow, rightBlockCols, rightBlock);
        }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildFileName(days, capacity);
    link.click();
    window.URL.revokeObjectURL(url);
}

function writeDayBlock(
    worksheet: ExcelJS.Worksheet,
    topRow: number,
    cols: { day: number; nameStart: number; nameEnd: number; qty: number },
    block: { day: number; items: PizzaSimulatorPlanItem[]; totalQty: number }
) {
    const fillColor = getDayFill(block.day);
    const planDate = formatPlanDate(getPlanDateByDay(block.day));
    const border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
    } as ExcelJS.Borders;

    worksheet.mergeCells(topRow, cols.day, topRow, cols.qty);
    worksheet.getCell(topRow, cols.day).value = `Дата: ${planDate}`;
    worksheet.getCell(topRow, cols.day).font = { bold: true, size: 10 };
    worksheet.getCell(topRow, cols.day).alignment = { horizontal: 'left', vertical: 'middle' };

    for (let col = cols.day; col <= cols.qty; col++) {
        worksheet.getCell(topRow, col).border = {
            bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } }
        };
    }

    const headerRow = topRow + 1;
    worksheet.mergeCells(headerRow, cols.nameStart, headerRow, cols.nameEnd);

    const dayHeader = worksheet.getCell(headerRow, cols.day);
    const nameHeader = worksheet.getCell(headerRow, cols.nameStart);
    const qtyHeader = worksheet.getCell(headerRow, cols.qty);

    dayHeader.value = 'День';
    nameHeader.value = 'Назва';
    qtyHeader.value = 'Партія';

    [dayHeader, nameHeader, qtyHeader].forEach((cell) => {
        cell.font = { bold: true, color: { argb: 'FF000000' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = border;
    });

    const headerMergedShadow = worksheet.getCell(headerRow, cols.nameEnd);
    headerMergedShadow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
    headerMergedShadow.border = border;

    const maxRows = Math.max(block.items.length, 5);

    for (let index = 0; index < maxRows; index++) {
        const rowNumber = topRow + 2 + index;
        const item = block.items[index];

        const dayCell = worksheet.getCell(rowNumber, cols.day);
        const nameCell = worksheet.getCell(rowNumber, cols.nameStart);
        const qtyCell = worksheet.getCell(rowNumber, cols.qty);

        worksheet.mergeCells(rowNumber, cols.nameStart, rowNumber, cols.nameEnd);

        dayCell.value = item ? block.day : null;
        nameCell.value = item ? item.product_name : null;
        qtyCell.value = item ? Number(item.quantity) : null;

        dayCell.alignment = { horizontal: 'center', vertical: 'middle' };
        nameCell.alignment = { horizontal: 'center', vertical: 'middle' };
        qtyCell.alignment = { horizontal: 'center', vertical: 'middle' };

        [dayCell, nameCell, qtyCell].forEach((cell) => {
            cell.border = border;
        });

        worksheet.getCell(rowNumber, cols.nameEnd).border = border;
    }

    const totalRow = topRow + 2 + maxRows;
    const totalCell = worksheet.getCell(totalRow, cols.qty);
    totalCell.value = block.totalQty;
    totalCell.font = { bold: true };
    totalCell.alignment = { horizontal: 'right', vertical: 'middle' };
}
