import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { syncKonditerkaLiveDataFromEdge } from '@/lib/konditerka-live-sync';
import {
    calculateBranchDistribution,
    createServiceRoleClient,
    type NormalizedDistributionRow,
} from '@/lib/branch-api';
import { buildKonditerkaFallbackAllocationRows } from '@/lib/konditerka-distribution-fallback';
import { fetchKonditerkaProductUnitMap } from '@/lib/konditerka-product-units';
import { normalizeKonditerkaUnit } from '@/lib/konditerka-dictionary';
import { fetchKonditerkaTodayProduction } from '@/lib/konditerka-production-source';
import { fetchKonditerkaStoreRevenuePriorityMap } from '@/lib/konditerka-store-revenue';
import {
    sendKonditerkaDistributionEmail,
    type KonditerkaDistributionEmailRow,
} from '@/lib/konditerka-distribution-email';

export const dynamic = 'force-dynamic';
const KONDITERKA_DISTRIBUTION_QUANTITY_SCALE = 1;
const KONDITERKA_SURPLUS_PRIORITY_TOP_COUNT = 10;

function getKonditerkaCronSecret(): string {
    return process.env.KONDITERKA_CRON_SECRET || process.env.CRON_SECRET || '';
}

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

function parseRecipients(value: string | undefined): string {
    return String(value || '')
        .split(/[;,]/g)
        .map((v) => v.trim())
        .filter(Boolean)
        .join(', ');
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

function toPositiveInt(value: unknown): number {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.max(0, Math.floor(raw));
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

async function countDistributionRowsForDate(
    supabaseAdmin: SupabaseClient,
    businessDate: string
): Promise<number> {
    const { count, error } = await supabaseAdmin
        .schema('konditerka1')
        .from('distribution_results')
        .select('id', { count: 'exact', head: true })
        .eq('business_date', businessDate);

    if (error) return 0;
    return Number(count || 0);
}

async function loadKonditerkaDistributionRows(
    supabaseAdmin: SupabaseClient
): Promise<NormalizedDistributionRow[]> {
    const { data, error } = await supabaseAdmin
        .schema('konditerka1')
        .from('v_konditerka_distribution_stats')
        .select('product_id, product_name, spot_id, spot_name, stock_now, min_stock, avg_sales_day, need_net, baked_at_factory');

    if (error) {
        throw new Error(`Failed to load Konditerka distribution stats: ${error.message}`);
    }

    return ((data || []) as Array<Record<string, unknown>>)
        .map((row) => {
            const productId = toPositiveInt(row.product_id);
            const storeId = toPositiveInt(row.spot_id);
            if (productId <= 0 || storeId <= 0) return null;

            return {
                productId,
                productName: String(row.product_name || '').trim() || `Product ${productId}`,
                storeId,
                storeName: String(row.spot_name || '').trim() || `Store ${storeId}`,
                stockNow: Math.max(0, toSafeNumber(row.stock_now)),
                minStock: Math.max(0, toSafeNumber(row.min_stock)),
                avgSalesDay: Math.max(0, toSafeNumber(row.avg_sales_day)),
                needNet: Math.max(0, toSafeNumber(row.need_net)),
                bakedAtFactory: Math.max(0, toSafeNumber(row.baked_at_factory)),
            } satisfies NormalizedDistributionRow;
        })
        .filter((row): row is NormalizedDistributionRow => row !== null);
}

async function attachKonditerkaUnits(rows: NormalizedDistributionRow[]) {
    const supabase = createServiceRoleClient();
    const unitMap = await fetchKonditerkaProductUnitMap(
        supabase,
        rows.map((row) => row.productId)
    ).catch(() => new Map());

    return rows.map((row) => ({
        ...row,
        unit: unitMap.get(row.productId) || normalizeKonditerkaUnit(undefined, row.productName),
    }));
}

async function loadKonditerkaUnitMap(productIds: number[]) {
    const supabase = createServiceRoleClient();
    return fetchKonditerkaProductUnitMap(supabase, productIds).catch(() => new Map());
}

async function runLiveFallbackDistribution(
    supabaseAdmin: SupabaseClient,
    businessDate: string
) {
    const serviceClient = createServiceRoleClient();
    const [rows, liveProduction] = await Promise.all([
        loadKonditerkaDistributionRows(serviceClient),
        fetchKonditerkaTodayProduction(serviceClient),
    ]);
    const rowsWithUnits = await attachKonditerkaUnits(rows);
    const unitMap = await loadKonditerkaUnitMap([
        ...rowsWithUnits.map((row) => row.productId),
        ...liveProduction.map((item) => item.product_id),
    ]);
    const storePriorityByStoreId = await fetchKonditerkaStoreRevenuePriorityMap().catch(
        () => new Map<number, number>()
    );
    const rowsByProductId = new Map<number, NormalizedDistributionRow[]>();
    const unitByProductId = new Map<number, string>();
    rowsWithUnits.forEach((row) => {
        const currentRows = rowsByProductId.get(row.productId) || [];
        currentRows.push(row);
        rowsByProductId.set(row.productId, currentRows);
        if (!unitByProductId.has(row.productId)) {
            unitByProductId.set(
                row.productId,
                unitMap.get(row.productId)
                    || String(row.unit || '').trim()
                    || normalizeKonditerkaUnit(undefined, row.productName)
            );
        }
    });

    const batchId = crypto.randomUUID();
    const fallbackRowsByProductId = new Map<number, NormalizedDistributionRow[]>();
    const fallbackProductIds = new Set<number>();

    const insertRows: Array<{
        product_name: string;
        spot_name: string;
        quantity_to_ship: number;
        calculation_batch_id: string;
        business_date: string;
        delivery_status: string;
    }> = [];

    for (const item of liveProduction) {
        const qty = Math.max(0, Number(item.baked_at_factory));
        if (qty <= 0) continue;

        const unit = unitByProductId.get(item.product_id)
            || unitMap.get(item.product_id)
            || normalizeKonditerkaUnit(undefined, item.product_name);
        let allocationRows = rowsByProductId.get(item.product_id) || [];
        if (allocationRows.length === 0) {
            fallbackProductIds.add(item.product_id);
            const cachedFallbackRows = fallbackRowsByProductId.get(item.product_id);
            allocationRows = cachedFallbackRows ?? await buildKonditerkaFallbackAllocationRows(serviceClient, {
                    productId: item.product_id,
                    productName: item.product_name,
                    productionQuantity: qty,
                    unit,
                });
            fallbackRowsByProductId.set(item.product_id, allocationRows);
        }

        const storeNameById = new Map<number, string>();
        allocationRows.forEach((row) => {
            if (!storeNameById.has(row.storeId)) {
                storeNameById.set(row.storeId, row.storeName);
            }
        });

        const calc = calculateBranchDistribution(allocationRows, item.product_id, qty, {
            unit,
            quantityScale: KONDITERKA_DISTRIBUTION_QUANTITY_SCALE,
            surplusPriorityTopCount: KONDITERKA_SURPLUS_PRIORITY_TOP_COUNT,
            storePriorityByStoreId,
        });
        const productName = allocationRows[0]?.productName || item.product_name || `Product ${item.product_id}`;

        Object.entries(calc.distributed).forEach(([storeIdRaw, shipQtyRaw]) => {
            const shipQty = Math.max(0, Number(shipQtyRaw));
            if (shipQty <= 0) return;

            const storeId = Number(storeIdRaw);
            insertRows.push({
                product_name: productName,
                spot_name: storeNameById.get(storeId) || `Store ${storeId}`,
                quantity_to_ship: shipQty,
                calculation_batch_id: batchId,
                business_date: businessDate,
                delivery_status: 'pending',
            });
        });

        if (calc.remaining > 0) {
            throw new Error(
                `Bug: full pool was not allocated for product ${item.product_id} (${productName}); remaining=${calc.remaining}`
            );
        }
    }

    const { error: deleteError } = await supabaseAdmin
        .schema('konditerka1')
        .from('distribution_results')
        .delete()
        .eq('business_date', businessDate);

    if (deleteError) {
        throw new Error(`Failed to clear Konditerka distribution rows: ${deleteError.message}`);
    }

    if (insertRows.length > 0) {
        const { error: insertError } = await supabaseAdmin
            .schema('konditerka1')
            .from('distribution_results')
            .insert(insertRows);

        if (insertError) {
            throw new Error(`Failed to save Konditerka distribution fallback: ${insertError.message}`);
        }
    }

    return {
        batchId,
        insertedRows: insertRows.length,
        productsWithProduction: liveProduction.length,
        fallbackProductsWithoutStats: fallbackProductIds.size,
    };
}

function normalizeKey(value: unknown): string {
    return String(value || '')
        .toLowerCase()
        .replace(/["'«»]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function loadEmailRows(
    supabaseAdmin: SupabaseClient,
    businessDate: string
): Promise<KonditerkaDistributionEmailRow[]> {
    const [distributionRes, statsRes] = await Promise.all([
        supabaseAdmin
            .schema('konditerka1')
            .from('distribution_results')
            .select('product_name, spot_name, quantity_to_ship, delivery_status')
            .eq('business_date', businessDate)
            .order('product_name', { ascending: true })
            .order('spot_name', { ascending: true }),
        supabaseAdmin
            .schema('konditerka1')
            .from('v_konditerka_distribution_stats')
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
        const key = `${normalizeKey(row.product_name)}::${normalizeKey(row.spot_name)}`;
        if (!key || key === '::' || statsMap.has(key)) continue;
        statsMap.set(key, {
            current_stock: Math.max(0, toSafeNumber(row.stock_now)),
            min_stock: Math.max(0, toSafeNumber(row.min_stock)),
            avg_sales: Math.max(0, toSafeNumber(row.avg_sales_day)),
        });
    }

    return ((distributionRes.data || []) as Array<Record<string, unknown>>).map((row) => {
        const key = `${normalizeKey(row.product_name)}::${normalizeKey(row.spot_name)}`;
        const stats = statsMap.get(key);
        return {
            product_name: String(row.product_name || ''),
            spot_name: String(row.spot_name || ''),
            quantity_to_ship: toPositiveInt(row.quantity_to_ship),
            delivery_status: String(row.delivery_status || 'pending'),
            current_stock: stats?.current_stock ?? null,
            min_stock: stats?.min_stock ?? null,
            avg_sales: stats?.avg_sales ?? null,
        };
    });
}

type JobStatus = 'running' | 'success' | 'email_sent' | 'email_skipped' | 'email_failed' | 'failed';

async function runScheduledDistribution(request: NextRequest) {
    const cronSecret = getKonditerkaCronSecret();
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
            { error: 'Scheduled Konditerka run supports only the current Kyiv business date.' },
            { status: 400 }
        );
    }

    if (!force) {
        const { data: existing, error: existingError } = await supabaseAdmin
            .schema('konditerka1')
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

    const recipientEmail = parseRecipients(process.env.KONDITERKA_DISTRIBUTION_EMAIL_TO);
    const subject = `Konditerka distribution ${businessDate}`;

    const { data: createdJob, error: createJobError } = await supabaseAdmin
        .schema('konditerka1')
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
        const { data: storageRows, error: storageErr } = await supabaseAdmin
            .schema('konditerka1')
            .from('v_konditerka_distribution_stats')
            .select('storage_id');

        if (storageErr) {
            warnings.push(`storage_map_error: ${storageErr.message}`);
        } else {
            const shopStorageIds = Array.from(
                new Set(
                    ((storageRows || []) as Array<Record<string, unknown>>)
                        .map((row) => toPositiveInt(row.storage_id))
                        .filter((id) => id > 0 && id !== 48)
                )
            ).sort((a, b) => a - b);

            try {
                await syncKonditerkaLiveDataFromEdge({
                    force: true,
                    shopStorageIds,
                });
            } catch (syncError) {
                warnings.push(toErrorMessage(syncError));
            }
        }

        const { error: refreshCatalogError } = await supabaseAdmin
            .schema('konditerka1')
            .rpc('refresh_production_180d_products', { p_product_ids: null });

        if (refreshCatalogError) {
            warnings.push(`refresh_catalog: ${refreshCatalogError.message}`);
        }

        let batchId: string | null = null;
        let mode = 'sql_distribution';
        const serviceClient = createServiceRoleClient();
        const liveProduction = await fetchKonditerkaTodayProduction(serviceClient);
        const productionRowsCount = liveProduction.length;

        const recalcRes = await supabaseAdmin
            .schema('konditerka1')
            .rpc('fn_full_recalculate_all');

        if (recalcRes.error) {
            if (recalcRes.error.code === '55P03' || recalcRes.error.message.includes('running')) {
                const conflictError = new Error('Calculation is already running');
                (conflictError as Error & { statusCode: number }).statusCode = 409;
                throw conflictError;
            }

            const fallback = await runLiveFallbackDistribution(supabaseAdmin, businessDate);
            batchId = fallback.batchId;
            mode = 'live_fallback_after_rpc_error';
        } else {
            batchId = (recalcRes.data as string | null) || null;
            const rowCount = await countDistributionRowsForDate(supabaseAdmin, businessDate);
            if (rowCount === 0) {
                const fallback = await runLiveFallbackDistribution(supabaseAdmin, businessDate);
                batchId = fallback.batchId;
                mode = 'live_fallback_after_empty_sql';
            }
        }

        const rows = await loadEmailRows(supabaseAdmin, businessDate);

        if (parseSkipEmail(request)) {
            await supabaseAdmin
                .schema('konditerka1')
                .from('distribution_jobs')
                .update({ status: 'email_skipped', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq('id', jobId);
            return NextResponse.json({
                success: true,
                skip_email: true,
                business_date: businessDate,
                rows,
                production_rows_count: productionRowsCount,
            });
        }

        const email = await sendKonditerkaDistributionEmail({
            businessDate,
            rows,
            productionRowsCount,
        });

        const nowIso = new Date().toISOString();
        const emailStatus: JobStatus =
            email.status === 'sent'
                ? 'email_sent'
                : email.status === 'skipped'
                    ? 'email_skipped'
                    : 'email_failed';

        await supabaseAdmin
            .schema('konditerka1')
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
                    production_rows_count: productionRowsCount,
                    mode,
                    warnings,
                },
                created_at: nowIso,
            });

        await supabaseAdmin
            .schema('konditerka1')
            .from('distribution_jobs')
            .update({
                status: emailStatus,
                calculation_batch_id: batchId,
                rows_count: rows.length,
                production_rows_count: productionRowsCount,
                error_message: email.reason || null,
                finished_at: nowIso,
                updated_at: nowIso,
                metadata: {
                    source: 'api_scheduled_run',
                    force,
                    mode,
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
            mode,
            rows_count: rows.length,
            production_rows_count: productionRowsCount,
            email,
            warnings,
        });
    } catch (error) {
        const message = toErrorMessage(error);
        const statusCode = toStatusCode(error);
        const nowIso = new Date().toISOString();

        await supabaseAdmin
            .schema('konditerka1')
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
