import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate') || (() => {
            const date = new Date();
            date.setDate(date.getDate() - 7);
            return date.toISOString().split('T')[0];
        })();
        const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0];

        // Calculate previous period for KPIs
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const prevEnd = new Date(start);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - diffDays);

        const supabase = await createClient();

        // 1. Fetch Current Data from v_gb_finance_overview
        const { data: currentData, error: currentErr } = await supabase
            .from('v_gb_finance_overview')
            .select('*')
            .eq('category', 'Кондитерка')
            .gte('transaction_date', startDate)
            .lte('transaction_date', endDate);

        // 2. Fetch Previous Data for KPIs
        const { data: prevData, error: prevErr } = await supabase
            .from('v_gb_finance_overview')
            .select('*')
            .eq('category', 'Кондитерка')
            .gte('transaction_date', prevStart.toISOString().split('T')[0])
            .lte('transaction_date', prevEnd.toISOString().split('T')[0]);

        // 3. Fetch Top Products
        const { data: topProds, error: topErr } = await supabase
            .from('v_gb_top_products_analytics')
            .select('product_name, quantity_sold, revenue_generated, profit_generated')
            .eq('category', 'Кондитерка')
            .gte('transaction_date', startDate)
            .lte('transaction_date', endDate);

        if (currentErr || prevErr || topErr) {
            throw new Error(`Supabase query failed: ${currentErr?.message || prevErr?.message || topErr?.message}`);
        }

        // --- Aggregating Data --- //

        // Stores & Current KPIs
        const storeMap = new Map<string, number>();
        let currentRev = 0, currentProfit = 0, currentQty = 0;

        const dateMap = new Map<string, { current: number, previous: number }>();

        (currentData || []).forEach(d => {
            const rev = Number(d.total_revenue) || 0;
            const prof = Number(d.total_profit) || 0;
            const qty = Number(d.total_quantity) || 0;

            currentRev += rev;
            currentProfit += prof;
            currentQty += qty;

            const storeName = d.store_name || 'Невідомий';
            const storeRev = storeMap.get(storeName) || 0;
            storeMap.set(storeName, storeRev + rev);

            // Date processing
            const dateObj = parseISO(d.transaction_date);
            const formattedDate = diffDays <= 7 ? format(dateObj, 'EEEE', { locale: uk }) : format(dateObj, 'd MMM', { locale: uk });

            const dp = dateMap.get(formattedDate) || { current: 0, previous: 0 };
            dateMap.set(formattedDate, { ...dp, current: dp.current + rev });
        });

        // Previous KPIs & mapping previous trends to current dates
        let prevRev = 0, prevProfit = 0, prevQty = 0;
        (prevData || []).forEach(d => {
            const rev = Number(d.total_revenue) || 0;
            const prof = Number(d.total_profit) || 0;
            const qty = Number(d.total_quantity) || 0;

            prevRev += rev;
            prevProfit += prof;
            prevQty += qty;

            const oldDate = parseISO(d.transaction_date);
            const eqDate = new Date(oldDate);
            eqDate.setDate(eqDate.getDate() + diffDays + 1);
            const formattedDate = diffDays <= 7 ? format(eqDate, 'EEEE', { locale: uk }) : format(eqDate, 'd MMM', { locale: uk });

            if (dateMap.has(formattedDate)) {
                const dp = dateMap.get(formattedDate)!;
                dateMap.set(formattedDate, { ...dp, previous: dp.previous + rev });
            } else {
                dateMap.set(formattedDate, { current: 0, previous: rev });
            }
        });

        // Top 5 Products
        const productMap = new Map<string, { revenue: number, qty: number }>();
        (topProds || []).forEach(p => {
            const existing = productMap.get(p.product_name) || { revenue: 0, qty: 0 };
            productMap.set(p.product_name, {
                revenue: existing.revenue + Number(p.revenue_generated),
                qty: existing.qty + Number(p.quantity_sold)
            });
        });

        const topProducts = Array.from(productMap.entries())
            .map(([name, data]) => ({ name, revenue: data.revenue, qty: data.qty }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5)
            .map((p, i) => ({ ...p, rank: i + 1, trend: 0 }));

        const storesData = Array.from(storeMap.entries())
            .map(([name, revenue]) => ({ name, revenue }))
            .sort((a, b) => b.revenue - a.revenue);

        // Make sure names are proper cased since day name might be all lowercase
        const revenueTrendData = Array.from(dateMap.entries()).map(([name, data]) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            current: data.current,
            previous: data.previous
        }));

        const kpis = {
            current: {
                revenue: currentRev,
                profit: currentProfit,
                margin_pct: currentRev > 0 ? (currentProfit / currentRev) * 100 : 0,
                qty: currentQty
            },
            previous: {
                revenue: prevRev,
                profit: prevProfit,
                margin_pct: prevRev > 0 ? (prevProfit / prevRev) * 100 : 0,
                qty: prevQty
            }
        };

        return NextResponse.json({
            revenueTrendData,
            storesData,
            topProducts,
            kpis
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        Logger.error('Konditerka Finance API Error', { error: err.message });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
