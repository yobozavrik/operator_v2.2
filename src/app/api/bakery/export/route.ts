import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const startDateParam = searchParams.get('start_date');
        const endDateParam = searchParams.get('end_date');
        const days = parseInt(searchParams.get('days') || '14', 10);

        let p_start_date: string;
        let p_end_date: string;

        if (startDateParam && endDateParam) {
            p_start_date = startDateParam;
            p_end_date = endDateParam;
        } else {
            const endDate = new Date();
            const startDate = new Date();
            endDate.setDate(endDate.getDate() - 1);
            startDate.setDate(endDate.getDate() - (days - 1));

            p_start_date = startDate.toISOString().split('T')[0];
            p_end_date = endDate.toISOString().split('T')[0];
        }

        const { createClient: createSupabaseJSClient } = await import('@supabase/supabase-js');
        const supabase = createSupabaseJSClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: rankings, error: rankingErr } = await supabase.rpc('f_craft_get_store_ranking', {
            p_start_date, p_end_date
        });

        if (rankingErr) {
            Logger.error('Export RPC Error f_craft_get_store_ranking', { error: rankingErr.message });
            throw new Error(`rankings: ${rankingErr.message}`);
        }

        const allStores = (rankings?.all_stores || []).sort((a: any, b: any) => b.total_sold - a.total_sold);

        // CREATE EXCEL WORKBOOK
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Antigravity Dashboard';
        workbook.created = new Date();

        // 1. STORES WORKSHEET
        const storeSheet = workbook.addWorksheet('Магазини');
        storeSheet.columns = [
            { header: 'ID Магазину', key: 'store_id', width: 10 },
            { header: 'Назва Магазину', key: 'store_name', width: 30 },
            { header: 'Продано Фреш (шт)', key: 'fresh_sold', width: 18 },
            { header: 'Продано Дисконт (шт)', key: 'disc_sold', width: 22 },
            { header: 'Списано (шт)', key: 'total_waste', width: 15 },
            { header: 'Всього продано (шт)', key: 'total_sold', width: 20 },
            { header: 'Каннібалізація (%)', key: 'cannibalization_pct', width: 20 },
            { header: 'Втрати (Waste UAH)', key: 'waste_uah', width: 20 },
        ];

        // Add Data Rows
        allStores.forEach((store: any) => storeSheet.addRow(store));

        // Format Header Row
        storeSheet.getRow(1).font = { bold: true };
        storeSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // Format Numbers
        storeSheet.getColumn('cannibalization_pct').numFmt = '0.00"%"';
        storeSheet.getColumn('waste_uah').numFmt = '#,##0.00 "₴"';

        // 2. SKU WORKSHEET
        const skuSheet = workbook.addWorksheet('Звіт по SKU');
        skuSheet.columns = [
            { header: 'ID Товару', key: 'sku_id', width: 15 },
            { header: 'Назва Товару', key: 'sku_name', width: 35 },
            { header: 'Всього продано (шт)', key: 'total_sold', width: 20 },
            { header: 'Чиста Виручка (Грн)', key: 'total_revenue', width: 22 },
        ];

        (rankings?.sku_abc || []).forEach((sku: any) => skuSheet.addRow(sku));
        skuSheet.getRow(1).font = { bold: true };
        skuSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        skuSheet.getColumn('total_revenue').numFmt = '#,##0.00 "₴"';

        // GENERATE BUFFER
        const buffer = await workbook.xlsx.writeBuffer();

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="craft_bakery_report_${p_start_date}_${p_end_date}.xlsx"`
            }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        Logger.error('Excel Export Error', { error: err.message || String(err) });
        return NextResponse.json({
            error: 'Failed to generate excel export',
            message: err.message
        }, { status: 500 });
    }
}
