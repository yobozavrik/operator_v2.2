import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { syncBranchProductionFromPoster } from '@/lib/branch-production-sync';
import {
    sendFloridaDistributionEmail,
    type FloridaDistributionEmailRow,
} from '@/lib/florida-distribution-email';
import { syncFloridaCatalogFromPoster } from '@/lib/florida-catalog';
import { syncFloridaStocksFromEdge } from '@/lib/florida-stock-sync';
import { getDistributionCronSecret } from '@/lib/distribution-env';

export const dynamic = 'force-dynamic';

function getKyivBusinessDate(date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(date);
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

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function toStatusCode(error: unknown): number {
    if (typeof error === 'object' && error !== null && 'statusCode' in error) {
        const statusCode = Number((error as { statusCode: unknown }).statusCode);
        if (Number.isFinite(statusCode) && statusCode >= 400 && statusCode <= 599) return statusCode;
    }
    return 500;
}

function parseRecipients(value: string | undefined): string {
    return String(value || '')
        .split(/[;,]/g)
        .map((v) => v.trim())
        .filter(Boolean)
        .join(', ');
}

type JobStatus = 'running' | 'email_sent' | 'email_skipped' | 'email_failed' | 'failed';

async function runScheduledDistribution(request: NextRequest) {
    const cronSecret = getDistributionCronSecret('florida');
    const requestSecret = getCronSecretFromRequest(request);

    if (!cronSecret || !secretsEqual(cronSecret, requestSecret)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    const force = parseForce(request);
    const businessDate = requestedDate || kyivToday;

    if (businessDate !== kyivToday) {
        return NextResponse.json(
            { error: 'Scheduled Florida run supports only the current Kyiv business date.' },
            { status: 400 }
        );
    }

    if (!force) {
        const { data: existing, error: existingError } = await supabaseAdmin
            .schema('florida1')
            .from('distribution_jobs')
            .select('id,status,business_date')
            .eq('business_date', businessDate)
            .eq('trigger_type', 'scheduled')
            .in('status', ['success', 'email_sent', 'email_skipped'])
            .order('started_at', { ascending: false })
            .limit(1);

        if (existingError) {
            return NextResponse.json({ error: existingError.message }, { status: 500 });
        }

        const last = Array.isArray(existing) ? existing[0] : null;
        if (last) {
            return NextResponse.json({
                success: true,
                already_processed: true,
                business_date: businessDate,
                job_id: last.id,
                status: last.status,
            });
        }
    }

    const recipientEmail = parseRecipients(process.env.FLORIDA_DISTRIBUTION_EMAIL_TO);
    const subject = `Florida distribution ${businessDate}`;

    const { data: createdJob, error: createJobError } = await supabaseAdmin
        .schema('florida1')
        .from('distribution_jobs')
        .insert({
            business_date: businessDate,
            trigger_type: 'scheduled',
            status: 'running',
            recipient_email: recipientEmail || null,
            email_subject: subject,
            metadata: { source: 'api_scheduled_run', force },
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

    if (createJobError || !createdJob?.id) {
        return NextResponse.json(
            { error: createJobError?.message || 'Failed to create distribution job' },
            { status: 500 }
        );
    }

    const jobId = createdJob.id as string;
    const warnings: string[] = [];

    try {
        const productionSync = await syncBranchProductionFromPoster(supabaseAdmin, 'florida1', 41);
        if (productionSync.warning) warnings.push(productionSync.warning);

        try {
            await syncFloridaCatalogFromPoster(supabaseAdmin);
        } catch (catalogErr: unknown) {
            warnings.push(`catalog sync failed: ${toErrorMessage(catalogErr)}`);
        }

        try {
            const stockSync = await syncFloridaStocksFromEdge(supabaseAdmin);
            warnings.push(...stockSync.warnings);
            if (stockSync.skippedStorages.length > 0) {
                warnings.push(`stock sync skipped storages: ${stockSync.skippedStorages.join(',')}`);
            }
        } catch (stockSyncErr: unknown) {
            warnings.push(`stock sync failed: ${toErrorMessage(stockSyncErr)}`);
        }

        const captureRes = await supabaseAdmin
            .schema('florida1')
            .rpc('fn_capture_daily_production', { p_business_date: businessDate });
        if (captureRes.error) {
            warnings.push(`capture_daily_production: ${captureRes.error.message}`);
        }

        const recalcRes = await supabaseAdmin
            .schema('florida1')
            .rpc('fn_full_recalculate_all');
        if (recalcRes.error) {
            if (recalcRes.error.code === '55P03' || recalcRes.error.message.includes('running')) {
                const conflictError = new Error('Calculation is already running');
                (conflictError as Error & { statusCode: number }).statusCode = 409;
                throw conflictError;
            }
            throw new Error(recalcRes.error.message);
        }

        const batchId = recalcRes.data as string | null;

        const resultsRes = await supabaseAdmin
            .schema('florida1')
            .rpc('fn_get_distribution_results', { p_business_date: businessDate });
        if (resultsRes.error) {
            throw new Error(resultsRes.error.message);
        }

        const rows = (resultsRes.data || []) as FloridaDistributionEmailRow[];

        if (parseSkipEmail(request)) {
            await supabaseAdmin
                .schema('florida1')
                .from('distribution_jobs')
                .update({ status: 'email_skipped', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq('id', jobId);
            return NextResponse.json({
                success: true,
                skip_email: true,
                business_date: businessDate,
                rows,
                production_rows_count: productionSync.itemsCount,
            });
        }

        const email = await sendFloridaDistributionEmail({
            businessDate,
            rows,
            productionRowsCount: productionSync.itemsCount,
        });

        const nowIso = new Date().toISOString();
        const emailStatus: JobStatus =
            email.status === 'sent'
                ? 'email_sent'
                : email.status === 'skipped'
                    ? 'email_skipped'
                    : 'email_failed';

        await supabaseAdmin
            .schema('florida1')
            .from('distribution_email_log')
            .insert({
                business_date: businessDate,
                job_id: jobId,
                recipient_email: email.recipients.join(', ') || 'not_configured',
                subject: email.subject,
                sent_at: email.sent ? nowIso : null,
                status: email.status,
                error_message: email.reason || null,
                payload_meta: {
                    message_id: email.messageId || null,
                    rows_count: rows.length,
                    production_rows_count: productionSync.itemsCount,
                    warnings,
                },
                created_at: nowIso,
            });

        await supabaseAdmin
            .schema('florida1')
            .from('distribution_jobs')
            .update({
                status: emailStatus,
                calculation_batch_id: batchId,
                rows_count: rows.length,
                production_rows_count: productionSync.itemsCount,
                error_message: email.reason || null,
                finished_at: nowIso,
                updated_at: nowIso,
                metadata: {
                    source: 'api_scheduled_run',
                    force,
                    warnings,
                    email_message_id: email.messageId || null,
                },
            })
            .eq('id', jobId);

        return NextResponse.json({
            success: true,
            job_id: jobId,
            business_date: businessDate,
            batch_id: batchId,
            rows_count: rows.length,
            production_rows_count: productionSync.itemsCount,
            email,
            warnings,
        });
    } catch (error) {
        const message = toErrorMessage(error);
        const statusCode = toStatusCode(error);
        const nowIso = new Date().toISOString();

        await supabaseAdmin
            .schema('florida1')
            .from('distribution_jobs')
            .update({
                status: 'failed',
                error_message: message,
                finished_at: nowIso,
                updated_at: nowIso,
                metadata: { source: 'api_scheduled_run', force, warnings },
            })
            .eq('id', jobId);

        return NextResponse.json({ error: message, job_id: jobId }, { status: statusCode });
    }
}

export async function GET(request: NextRequest) {
    return runScheduledDistribution(request);
}

export async function POST(request: NextRequest) {
    return runScheduledDistribution(request);
}
