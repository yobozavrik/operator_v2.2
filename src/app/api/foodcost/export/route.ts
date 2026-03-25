import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireAuth } from '@/lib/auth-guard';

export async function POST(request: Request) {
    try {
        await requireAuth();
        const body = await request.json();
        const { data, tab, historyData } = body;

        const wb = new ExcelJS.Workbook();
        const sheetNameMap: Record<string, string> = {
            positions: 'Позиції',
            matrix: 'Ефективність',
            heatmap: 'Теплова карта',
            goals: 'Цілі'
        };

        if (tab === 'positions' || tab === 'matrix') {
            const rows = data.categories.flatMap((cat: any) =>
                cat.products.map((p: any) => ({
                    'Категорія': cat.category_name,
                    'Позиція': p.product_name,
                    'Виручка, грн': Math.round(p.revenue || 0),
                    'Собівартість, грн': Math.round(p.cost || 0),
                    'Маржа, грн': Math.round(p.margin || 0),
                    'Фудкост %': parseFloat((p.foodcost_pct || 0).toFixed(1)),
                    'ФК попер. %': parseFloat((p.foodcost_pct_prev || 0).toFixed(1)),
                    'Дельта ФК': parseFloat((p.foodcost_delta || 0).toFixed(2)),
                    'Зміна маржі %': parseFloat((p.margin_delta_pct || 0).toFixed(1)),
                    'Продано': parseFloat((p.qty || 0).toFixed(2)),
                    'Одиниця': p.unit,
                    'Ціна': p.price,
                }))
            );
            
            const ws = wb.addWorksheet(sheetNameMap.positions || 'Позиції');
            if (rows.length > 0) {
                const columns = Object.keys(rows[0]).map(k => ({ header: k, key: k, width: 15 }));
                ws.columns = columns;
                ws.addRows(rows);
            } else {
                ws.addRow(['Немає даних']);
            }
        }

        if (tab === 'matrix') {
            const FC_THRESHOLD = 40;
            const MARGIN_THRESHOLD = 5000;
            const quadrant = (fc: number, m: number) => {
                if (fc <= FC_THRESHOLD && m >= MARGIN_THRESHOLD) return 'Зірки';
                if (fc > FC_THRESHOLD && m >= MARGIN_THRESHOLD) return 'Дійні корови';
                if (fc <= FC_THRESHOLD && m < MARGIN_THRESHOLD) return 'Питання';
                return 'Баласт';
            };
            const rows = data.categories.flatMap((cat: any) =>
                cat.products.filter((p: any) => p.revenue > 500).map((p: any) => ({
                    'Квадрант': quadrant(p.foodcost_pct || 0, p.margin || 0),
                    'Категорія': cat.category_name,
                    'Позиція': p.product_name,
                    'Фудкост %': parseFloat((p.foodcost_pct || 0).toFixed(1)),
                    'Маржа, грн': Math.round(p.margin || 0),
                    'Виручка, грн': Math.round(p.revenue || 0),
                }))
            );
            
            const ws = wb.addWorksheet(sheetNameMap.matrix || 'Ефективність');
            if (rows.length > 0) {
                const columns = Object.keys(rows[0]).map(k => ({ header: k, key: k, width: 15 }));
                ws.columns = columns;
                ws.addRows(rows);
            } else {
                ws.addRow(['Немає даних']);
            }
        }

        if (tab === 'heatmap' && historyData && historyData.length > 0) {
            const catIds = Array.from(new Set(historyData.flatMap((w: any) => w.categories.map((c: any) => c.category_id))));
            const rows = catIds.map((catId: any) => {
                const nameItem = historyData.flatMap((w: any) => w.categories).find((c: any) => c.category_id === catId);
                const name = nameItem?.category_name ?? catId;
                const row: Record<string, string | number> = { 'Категорія': name };
                historyData.forEach((w: any) => {
                    const c = w.categories.find((c: any) => c.category_id === catId);
                    row[w.label] = c ? parseFloat(c.foodcost_pct.toFixed(1)) : '';
                });
                return row;
            });
            
            const ws = wb.addWorksheet(sheetNameMap.heatmap || 'Теплова карта');
            if (rows.length > 0) {
                const columns = Object.keys(rows[0]).map(k => ({ header: k, key: k, width: 15 }));
                ws.columns = columns;
                ws.addRows(rows);
            } else {
                ws.addRow(['Немає даних']);
            }
        }

        if (tab === 'goals') {
            const allProducts = data.categories.flatMap((cat: any) =>
                cat.products.map((p: any) => ({
                    'Категорія': cat.category_name,
                    'Позиція': p.product_name,
                    'ФК %': parseFloat((p.foodcost_pct || 0).toFixed(1)),
                    'Маржа, грн': Math.round(p.margin || 0),
                    'Виручка, грн': Math.round(p.revenue || 0),
                    'Статус': p.foodcost_pct > 50 ? 'Критичний' : p.foodcost_pct > 40 ? 'Увага' : 'OK',
                }))
            );
            
            const ws = wb.addWorksheet(sheetNameMap.goals || 'Цілі');
            if (allProducts.length > 0) {
                const columns = Object.keys(allProducts[0]).map(k => ({ header: k, key: k, width: 15 }));
                ws.columns = columns;
                ws.addRows(allProducts);
            } else {
                ws.addRow(['Немає даних']);
            }
        }

        if (wb.worksheets.length === 0) {
            const ws = wb.addWorksheet('Дані');
            ws.addRow(['Немає даних для цієї вкладки']);
        }

        const buffer = await wb.xlsx.writeBuffer();

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Disposition': `attachment; filename="foodcost_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx"`,
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
        });
    } catch (error: any) {
        console.error('Export error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
