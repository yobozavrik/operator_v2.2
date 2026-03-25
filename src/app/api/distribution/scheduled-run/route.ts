import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
    sendCombinedDistributionEmail,
    type BranchDigestResult,
    type DistributionEmailRow,
} from '@/lib/combined-distribution-email';

export const dynamic = 'force-dynamic';

// NOTE: All 3 branch endpoints are called in parallel via Promise.allSettled.
// Each branch runs sync + recalculate in its own Vercel function instance.
// On Hobby plan (10s timeout per function), branches run in parallel so
// combined overhead is ~max(branch_times) + email_send ~= 8-9s. Acceptable.

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

function getKyivBusinessDate(date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(date);
}

interface BranchSkipEmailPayload {
    success: boolean;
    skip_email?: boolean;
    already_processed?: boolean;
    rows?: DistributionEmailRow[];
    production_rows_count?: number;
    error?: string;
    status?: string;
}

async function callBranchWithSkipEmail(
    origin: string,
    path: string,
    secret: string,
    businessDate: string
): Promise<BranchDigestResult['status'] extends 'ok' ? { ok: true; rows: DistributionEmailRow[]; productionRowsCount: number } : never> {
    throw new Error('not used'); // overloaded below
}

type BranchCallOk = { ok: true; rows: DistributionEmailRow[]; productionRowsCount: number };
type BranchCallFail = { ok: false; reason: string };
type BranchCallReturn = BranchCallOk | BranchCallFail;

async function fetchBranch(
    origin: string,
    path: string,
    secret: string,
    businessDate: string
): Promise<BranchCallReturn> {
    try {
        const url = `${origin}${path}?skip_email=true&force=true&date=${businessDate}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'x-cron-secret': secret },
            cache: 'no-store',
        });

        const payload = (await response.json().catch(() => ({}))) as BranchSkipEmailPayload;

        if (!response.ok) {
            return { ok: false, reason: payload.error || `HTTP ${response.status}` };
        }
        if (payload.already_processed) {
            // Already ran today, re-use rows if returned, else note as skipped
            if (payload.rows && payload.rows.length > 0) {
                return { ok: true, rows: payload.rows, productionRowsCount: payload.production_rows_count || 0 };
            }
            return { ok: false, reason: 'already_processed — no rows returned' };
        }
        if (!payload.success) {
            return { ok: false, reason: payload.error || 'branch returned success=false' };
        }
        return {
            ok: true,
            rows: payload.rows || [],
            productionRowsCount: payload.production_rows_count || 0,
        };
    } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : 'fetch error' };
    }
}

async function runCombinedDistribution(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET || process.env.BULVAR_CRON_SECRET || '';
    const requestSecret = getCronSecretFromRequest(request);

    if (!cronSecret || !secretsEqual(cronSecret, requestSecret)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const businessDate = getKyivBusinessDate();
    const origin = request.nextUrl.origin;

    const [bulvarRes, konditerkaRes, floridaRes] = await Promise.allSettled([
        fetchBranch(
            origin,
            '/api/bulvar/distribution/scheduled-run',
            process.env.BULVAR_CRON_SECRET || process.env.CRON_SECRET || '',
            businessDate
        ),
        fetchBranch(
            origin,
            '/api/konditerka/distribution/scheduled-run',
            process.env.KONDITERKA_CRON_SECRET || process.env.CRON_SECRET || '',
            businessDate
        ),
        fetchBranch(
            origin,
            '/api/florida/distribution/scheduled-run',
            process.env.FLORIDA_CRON_SECRET || process.env.CRON_SECRET || '',
            businessDate
        ),
    ]);

    const toBranchDigest = (
        result: PromiseSettledResult<BranchCallReturn>,
        branch: BranchDigestResult['branch']
    ): BranchDigestResult => {
        if (result.status === 'rejected') {
            return { branch, status: 'failed', reason: String(result.reason), rows: [], productionRowsCount: 0 };
        }
        const value = result.value;
        if (!value.ok) {
            return { branch, status: 'failed', reason: value.reason, rows: [], productionRowsCount: 0 };
        }
        return { branch, status: 'ok', rows: value.rows, productionRowsCount: value.productionRowsCount };
    };

    const branches: BranchDigestResult[] = [
        toBranchDigest(bulvarRes, 'bulvar'),
        toBranchDigest(konditerkaRes, 'konditerka'),
        toBranchDigest(floridaRes, 'florida'),
    ];

    const emailResult = await sendCombinedDistributionEmail({ businessDate, branches });

    const responseBody = {
        success: emailResult.sent,
        business_date: businessDate,
        branches: branches.map((b) => ({
            branch: b.branch,
            status: b.status,
            rows_count: b.rows.length,
            production_rows_count: b.productionRowsCount,
            reason: b.reason,
        })),
        email: {
            status: emailResult.status,
            subject: emailResult.subject,
            recipients: emailResult.recipients,
            messageId: emailResult.messageId,
            reason: emailResult.reason,
        },
    };

    return NextResponse.json(responseBody, { status: emailResult.sent ? 200 : 500 });
}

export async function GET(request: NextRequest) {
    return runCombinedDistribution(request);
}

export async function POST(request: NextRequest) {
    return runCombinedDistribution(request);
}
