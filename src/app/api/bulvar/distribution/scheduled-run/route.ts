import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
    sendBulvarDistributionEmail,
    type BulvarDistributionEmailRow,
} from '@/lib/bulvar-distribution-email';
import { normalizeDistributionSpotName } from '@/lib/distribution-spot-name';

export const dynamic = 'force-dynamic';

function getBulvarCronSecret(): string {
    return process.env.BULVAR_CRON_SECRET || process.env.CRON_SECRET || '';
}

function getKyivBusinessDate(date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(date);
}

function getKyivHour(date = new Date()): number {
    const hour = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Kyiv',
        hour: '2-digit',
        hour12: false,
    }).format(date);
    return Number(hour);
}

function getCronSecretFromRequest(request: NextRequest): string {
    const headerSecret = request.headers.get('x-cron-secret');
    if (headerSecret) return headerSecret;
    const authHeader = request.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || '';
}

function secretsEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a || '', 'utf8');
    const bBuf = Buffer.from(b || '', 'utf8');
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
}

function parseForce(request: NextRequest): boolean {
    const force = request.nextUrl.searchParams.get('force');
    return String(force || '').toLowerCase() === 'true';
}

function parseSkipEmail(request: NextRequest): boolean {
    return request.nextUrl.searchParams.get('skip_email') === 'true';
}

function parseRequestedDate(request: NextRequest): string | null {
    const date = request.nextUrl.searchParams.get('date');
    if (!date) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function parseJobId(request: NextRequest): string | null {
    const jobId = request.nextUrl.searchParams.get('job_id');
    if (!jobId) return null;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)
        ? jobId
        : null;
}

function toPositiveQuantity(value: unknown): number {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.round(raw * 1000) / 1000;
}

function toSafeNumber(value: unknown): number {
    const raw = Number(value);
    if (Number.isFinite(raw)) return raw;
    if (typeof value === 'string') {
        const parsed = Number(value.replace(',', '.'));
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

function normalizeKey(value: unknown): string {
    return String(value || '')
        .toLowerCase()
        .replace(/["'«»]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function countDistributionRowsForDate(
    supabaseAdmin: SupabaseClient,
    businessDate: string
): Promise<number> {
    const { count, error } = await supabaseAdmin
        .schema('bulvar1')
        .from('distribution_results')
        .select('id', { count: 'exact', head: true })
        .eq('business_date', businessDate);

    if (error) return 0;
    return Number(count || 0);
}

async function loadExistingEmailLog(
    supabaseAdmin: SupabaseClient,
    businessDate: string
): Promise<{ id: string; status: string; subject: string | null; recipient_email: string | null } | null> {
    const { data, error } = await supabaseAdmin
        .schema('bulvar1')
        .from('distribution_email_log')
        .select('id, status, subject, recipient_email')
        .eq('business_date', businessDate)
        .eq('status', 'sent')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) return null;
    return data || null;
}

async function loadProductionRowsCount(
    supabaseAdmin: SupabaseClient
): Promise<number> {
    const { count, error } = await supabaseAdmin
        .schema('bulvar1')
        .from('v_bulvar_production_only')
        .select('product_id', { count: 'exact', head: true })
        .gt('baked_at_factory', 0);

    if (error) return 0;
    return Number(count || 0);
}

async function loadEmailRows(
    supabaseAdmin: SupabaseClient,
    businessDate: string
): Promise<BulvarDistributionEmailRow[]> {
    const [distributionRes, statsRes] = await Promise.all([
        supabaseAdmin
            .schema('bulvar1')
            .from('distribution_results')
            .select('product_name, spot_name, quantity_to_ship, delivery_status')
            .eq('business_date', businessDate)
            .order('product_name', { ascending: true })
            .order('spot_name', { ascending: true }),
        supabaseAdmin
            .schema('bulvar1')
            .from('v_bulvar_distribution_stats_x3')
            .select('product_name, spot_name, stock_now, min_stock, avg_sales_day'),
    ]);

    if (distributionRes.error) {
        throw new Error(distributionRes.error.message);
    }
    if (statsRes.error) {
        throw new Error(statsRes.error.message);
    }

    const statsMap = new Map<
        string,
        { current_stock: number; min_stock: number; avg_sales: number }
    >();

    for (const row of (statsRes.data || []) as Array<Record<string, unknown>>) {
        const key = `${normalizeKey(row.product_name)}::${normalizeKey(
            normalizeDistributionSpotName(row.spot_name)
        )}`;
        if (!key || key === '::' || statsMap.has(key)) continue;
        statsMap.set(key, {
            current_stock: Math.max(0, toSafeNumber(row.stock_now)),
            min_stock: Math.max(0, toSafeNumber(row.min_stock)),
            avg_sales: Math.max(0, toSafeNumber(row.avg_sales_day)),
        });
    }

    return ((distributionRes.data || []) as Array<Record<string, unknown>>).map((row) => {
        const spotName = normalizeDistributionSpotName(row.spot_name);
        const key = `${normalizeKey(row.product_name)}::${normalizeKey(spotName)}`;
        const stats = statsMap.get(key);
        return {
            product_name: String(row.product_name || ''),
            spot_name: spotName,
            quantity_to_ship: toPositiveQuantity(row.quantity_to_ship),
            delivery_status: String(row.delivery_status || 'pending'),
            current_stock: stats?.current_stock ?? null,
            min_stock: stats?.min_stock ?? null,
            avg_sales: stats?.avg_sales ?? null,
        };
    });
}

async function persistEmailStatus(
    supabaseAdmin: SupabaseClient,
    input: {
        businessDate: string;
        jobId: string | null;
        email: Awaited<ReturnType<typeof sendBulvarDistributionEmail>>;
        rowsCount: number;
        productionRowsCount: number;
    }
): Promise<void> {
    const nowIso = new Date().toISOString();
    const status =
        input.email.status === 'sent'
            ? 'email_sent'
            : input.email.status === 'skipped'
                ? 'email_skipped'
                : 'email_failed';

    const resolvedJobId = input.jobId || (
        await supabaseAdmin
            .schema('bulvar1')
            .from('distribution_jobs')
            .select('id')
            .eq('business_date', input.businessDate)
            .eq('trigger_type', 'scheduled')
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle()
    ).data?.id || null;

    await supabaseAdmin
        .schema('bulvar1')
        .from('distribution_email_log')
        .insert({
            business_date: input.businessDate,
            job_id: resolvedJobId,
            recipient_email: input.email.recipients.join(', ') || null,
            subject: input.email.subject,
            sent_at: input.email.sent ? nowIso : null,
            status: input.email.status,
            error_message: input.email.reason || null,
            payload_meta: {
                message_id: input.email.messageId || null,
                rows_count: input.rowsCount,
                production_rows_count: input.productionRowsCount,
            },
            created_at: nowIso,
        });

    if (resolvedJobId) {
        await supabaseAdmin
            .schema('bulvar1')
            .from('distribution_jobs')
            .update({
                status,
                error_message: input.email.reason || null,
                finished_at: nowIso,
                updated_at: nowIso,
                metadata: {
                    source: 'api_scheduled_run',
                    email_message_id: input.email.messageId || null,
                },
            })
            .eq('id', resolvedJobId);
    }
}

async function triggerDistributionRun(): Promise<void> {
    const cronSecret = getBulvarCronSecret();
    const origin = process.env.INTERNAL_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${origin}/api/bulvar/distribution/run`, {
        method: 'POST',
        headers: {
            'x-cron-secret': cronSecret,
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(payload.error || payload.message || `Bulvar run HTTP ${response.status}`);
    }
}

async function runScheduledDistribution(request: NextRequest) {
    const cronSecret = getBulvarCronSecret();
    const requestSecret = getCronSecretFromRequest(request);

    if (!cronSecret || !secretsEqual(cronSecret, requestSecret)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const force = parseForce(request);
    const kyivHour = getKyivHour();
    if (!force && kyivHour !== 23) {
        return NextResponse.json({
            success: true,
            skipped: true,
            reason: `Current Kyiv hour is ${kyivHour}, scheduled send window is 23:00`,
        });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !supabaseUrl) {
        return NextResponse.json({ error: 'Server Config Error' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false },
    });

    const kyivToday = getKyivBusinessDate();
    const requestedDate = parseRequestedDate(request);
    const jobId = parseJobId(request);
    const businessDate = requestedDate || kyivToday;

    if (businessDate !== kyivToday) {
        return NextResponse.json(
            { error: 'Scheduled Bulvar run supports only the current Kyiv business date.' },
            { status: 400 }
        );
    }

    const existingEmailLog = force ? null : await loadExistingEmailLog(supabaseAdmin, businessDate);
    if (existingEmailLog) {
        const rowsCount = await countDistributionRowsForDate(supabaseAdmin, businessDate);
        const productionRowsCount = await loadProductionRowsCount(supabaseAdmin);
        return NextResponse.json({
            success: true,
            already_processed: true,
            business_date: businessDate,
            rows_count: rowsCount,
            production_rows_count: productionRowsCount,
            email: {
                sent: true,
                skipped: false,
                status: 'sent',
                subject: existingEmailLog.subject || `Bulvar distribution ${businessDate}`,
                recipients: String(existingEmailLog.recipient_email || '')
                    .split(/[;,]/g)
                    .map((value) => value.trim())
                    .filter(Boolean),
            },
        });
    }

    let rowsCount = await countDistributionRowsForDate(supabaseAdmin, businessDate);
    if (force || rowsCount === 0) {
        await triggerDistributionRun();
        rowsCount = await countDistributionRowsForDate(supabaseAdmin, businessDate);
    }

    const productionRowsCount = await loadProductionRowsCount(supabaseAdmin);
    const rows = await loadEmailRows(supabaseAdmin, businessDate);

    if (parseSkipEmail(request)) {
        return NextResponse.json({
            success: true,
            skip_email: true,
            business_date: businessDate,
            rows,
            production_rows_count: productionRowsCount,
        });
    }

    const email = await sendBulvarDistributionEmail({
        businessDate,
        rows,
        productionRowsCount,
    });

    await persistEmailStatus(supabaseAdmin, {
        businessDate,
        jobId,
        email,
        rowsCount: rows.length,
        productionRowsCount,
    }).catch(() => {
        // Do not fail the outward email response when tracking persistence is unavailable.
    });

    if (email.status !== 'sent') {
        return NextResponse.json({
            error: email.reason || 'Bulvar distribution email failed',
            business_date: businessDate,
            rows_count: rows.length,
            distribution_rows_count: rowsCount,
            production_rows_count: productionRowsCount,
            email,
        }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        business_date: businessDate,
        rows_count: rows.length,
        distribution_rows_count: rowsCount,
        production_rows_count: productionRowsCount,
        email,
    });
}

export async function GET(request: NextRequest) {
    return runScheduledDistribution(request);
}

export async function POST(request: NextRequest) {
    return runScheduledDistribution(request);
}
