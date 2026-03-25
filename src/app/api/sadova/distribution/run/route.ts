/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';
import { timingSafeEqual } from 'crypto';
import { normalizeSadovaName, syncSadovaCatalogFromManufactures } from '@/lib/sadova-catalog';

export const dynamic = 'force-dynamic';

const POSTER_TOKEN = process.env.POSTER_TOKEN || '';
const POSTER_ACCOUNT = process.env.POSTER_ACCOUNT || 'galia-baluvana34';

function getSadovaWorkshopStorageId(): number {
    const raw = Number.parseInt(String(process.env.SADOVA_WORKSHOP_STORAGE_ID || '34'), 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 34;
}

function kyivBusinessDate(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Kyiv',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const month = parts.find((p) => p.type === 'month')?.value ?? '01';
    const day = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${year}-${month}-${day}`;
}

function kyivBusinessDateWithOffset(offsetDays = 0): string {
    const base = new Date();
    if (offsetDays !== 0) base.setDate(base.getDate() + offsetDays);
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Kyiv',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(base);

    const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const month = parts.find((p) => p.type === 'month')?.value ?? '01';
    const day = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${year}-${month}-${day}`;
}

function toPositiveNumber(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed;
}

function hasInternalApiAccess(request: Request): boolean {
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) return false;

    const authHeader = request.headers.get('authorization');
    const headerSecret = request.headers.get('x-internal-api-secret');

    const secretBuf = Buffer.from(secret);
    const bearerValue = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (bearerValue && bearerValue.length === secret.length) {
        if (timingSafeEqual(Buffer.from(bearerValue), secretBuf)) return true;
    }
    if (headerSecret && headerSecret.length === secret.length) {
        if (timingSafeEqual(Buffer.from(headerSecret), secretBuf)) return true;
    }
    return false;
}

async function posterRequest(method: string, params: Record<string, string> = {}) {
    if (!POSTER_TOKEN) {
        throw new Error('POSTER_TOKEN environment variable is missing.');
    }

    const url = new URL(`https://${POSTER_ACCOUNT}.joinposter.com/api/${method}`);
    url.searchParams.append('token', POSTER_TOKEN);

    Object.keys(params).forEach((key) => {
        url.searchParams.append(key, params[key]);
    });
    url.searchParams.append('_t', Date.now().toString());

    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Poster API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(`Poster API Error response: ${data.error}`);
    }
    return data;
}

function asPositiveIntArray(input: unknown): number[] {
    if (!Array.isArray(input)) return [];
    const numbers = input
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
        .map((v) => Math.trunc(v));
    return Array.from(new Set(numbers));
}

export async function POST(request: Request) {
    try {
        if (!hasInternalApiAccess(request)) {
            const auth = await requireAuth();
            if (auth.error) return auth.error;
        }

        const body = await request.json().catch(() => ({}));
        const requestedShopIds = asPositiveIntArray(body?.shop_ids);
        const workshopStorageId = getSadovaWorkshopStorageId();
        const warnings: string[] = [];

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Missing Supabase service credentials');
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false },
        });
        const sadovaDb = supabase.schema('sadova1');
        const categoriesDb = supabase.schema('categories');

        const { data: shopRows, error: shopsError } = await sadovaDb
            .from('distribution_shops')
            .select('spot_id, storage_id')
            .eq('is_active', true)
            .not('storage_id', 'is', null);

        if (shopsError) throw new Error(`Error fetching Sadova shops: ${shopsError.message}`);
        if (!shopRows || shopRows.length === 0) throw new Error('No active Sadova shops found in DB.');

        const spotIds = Array.from(new Set(shopRows.map((row: any) => Number(row.spot_id))));
        const { data: spotsRows, error: spotsError } = await categoriesDb
            .from('spots')
            .select('spot_id, name')
            .in('spot_id', spotIds);

        if (spotsError) throw new Error(`Error fetching spot names: ${spotsError.message}`);

        const spotNameById = new Map<number, string>(
            (spotsRows || []).map((spot: any) => [Number(spot.spot_id), String(spot.name || '')])
        );

        const shopsRaw = (shopRows || []).map((row: any) => ({
            spot_id: Number(row.spot_id),
            storage_id: Number(row.storage_id),
            spot_name: spotNameById.get(Number(row.spot_id)) || `Spot ${row.spot_id}`,
        }));

        let activeShops = shopsRaw as Array<{ spot_id: number; storage_id: number; spot_name: string }>;
        if (requestedShopIds.length > 0) {
            activeShops = activeShops.filter((s) => requestedShopIds.includes(s.spot_id));
        }

        if (activeShops.length === 0) {
            return NextResponse.json(
                { success: false, error: 'No matching active Sadova shops found for requested subset.' },
                { status: 400 }
            );
        }

        const storageIds = activeShops.map((s) => s.storage_id);
        const resolvedShopIds = activeShops.map((s) => s.spot_id);
        const mapStorageToSpot = new Map(activeShops.map((s) => [s.storage_id, s.spot_id]));

        let liveStocks: any[] = [];
        let failedStorages: number[] = [];

        try {
            const edgeUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/poster-live-stocks`;
            const edgeResponse = await fetch(edgeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${serviceRoleKey}`,
                    apikey: serviceRoleKey,
                },
                body: JSON.stringify({ storage_ids: storageIds }),
            });

            if (!edgeResponse.ok) {
                throw new Error(`Edge Function returned HTTP ${edgeResponse.status}`);
            }

            const edgeResult = await edgeResponse.json();
            if (!edgeResult || !edgeResult.storages_status) {
                throw new Error('Edge Function returned invalid payload.');
            }

            let pendingStorages = [...storageIds];
            const storagesStatus = edgeResult.storages_status || [];
            const edgeSuccessfulIds = storagesStatus
                .filter((s: any) => s.status === 'success')
                .map((s: any) => Number(s.storage_id));

            pendingStorages = pendingStorages.filter((id) => !edgeSuccessfulIds.includes(id));

            liveStocks = (edgeResult.rows || []).map((item: any) => ({
                storage_id: Number(item.storage_id),
                ingredient_id: Number.isFinite(Number(item.ingredient_id)) ? Number(item.ingredient_id) : null,
                ingredient_name: String(item.ingredient_name || ''),
                ingredient_name_normalized: normalizeSadovaName(String(item.ingredient_name || '')),
                stock_left: parseFloat(item.stock_left || item.ingredient_left || item.storage_ingredient_left || '0'),
                unit: item.unit || item.ingredient_unit || 'кг',
            }));

            if (pendingStorages.length > 0) {
                for (const storageId of pendingStorages) {
                    try {
                        const directData = await posterRequest('storage.getStorageLeftovers', {
                            storage_id: String(storageId),
                        });
                        if (directData && Array.isArray(directData.response)) {
                            const normalizedDirect = directData.response.map((item: any) => ({
                                storage_id: Number(storageId),
                                ingredient_id: Number.isFinite(Number(item.ingredient_id))
                                    ? Number(item.ingredient_id)
                                    : null,
                                ingredient_name: String(item.ingredient_name || ''),
                                ingredient_name_normalized: normalizeSadovaName(String(item.ingredient_name || '')),
                                stock_left: parseFloat(
                                    item.stock_left || item.ingredient_left || item.storage_ingredient_left || '0'
                                ),
                                unit: item.unit || 'кг',
                            }));
                            liveStocks.push(...normalizedDirect);
                            pendingStorages = pendingStorages.filter((id) => id !== storageId);
                        }
                    } catch (directErr) {
                        console.error(`Sadova direct fallback failed for storage ${storageId}:`, directErr);
                    }
                }
            }

            failedStorages = pendingStorages;
        } catch (err: any) {
            console.error('Sadova live stock fetch failed:', err);
            throw new Error(`Critical dependency live stocks sync failed: ${err.message}`);
        }

        const dateStr = kyivBusinessDate();
        let rawManufactures: any[] = [];
        let catalogSync = { inserted: 0, renamed: 0, reactivated: 0, skipped_without_id: 0 };

        try {
            const manufacturesData = await posterRequest('storage.getManufactures', {
                dateFrom: dateStr,
                dateTo: dateStr,
            });

            rawManufactures = (manufacturesData.response || []) as any[];
            catalogSync = await syncSadovaCatalogFromManufactures(
                sadovaDb,
                categoriesDb,
                rawManufactures,
                workshopStorageId
            );
        } catch (err: any) {
            console.error('Sadova manufactures fetch failed:', err);
            throw new Error(`Critical dependency live production sync failed: ${err.message}`);
        }

        const { data: catalogRaw, error: catalogError } = await sadovaDb
            .from('production_catalog')
            .select('product_id, product_name')
            .eq('is_active', true);

        if (catalogError) throw new Error(`Error fetching Sadova catalog: ${catalogError.message}`);

        const catalogNamesNormalized = new Set<string>();
        const catalogIdByName = new Map<string, number>();
        const catalogIdSet = new Set<number>();
        (catalogRaw || []).forEach((c: any) => {
            const norm = normalizeSadovaName(String(c.product_name || ''));
            if (!norm) return;
            catalogNamesNormalized.add(norm);
            const id = Number(c.product_id);
            if (Number.isFinite(id) && id > 0) {
                catalogIdByName.set(norm, id);
                catalogIdSet.add(id);
            }
        });

        let manufactures: any[] = [];
        let totalManufacturedKg = 0;
        const missingCatalogById = new Map<number, { product_id: number; product_name: string }>();

        rawManufactures.forEach((m: any) => {
            const storageId = Number.parseInt(String(m.storage_id || ''), 10);
            if (storageId !== workshopStorageId) return;

            if (m.products && Array.isArray(m.products)) {
                m.products.forEach((p: any) => {
                    const name = String(p.product_name || p.ingredient_name || '').trim();
                    const normalized = normalizeSadovaName(name);
                    const quantity =
                        toPositiveNumber(p.product_num) ||
                        toPositiveNumber(p.quantity) ||
                        toPositiveNumber(p.num) ||
                        toPositiveNumber(p.amount);
                    if (!name || !normalized || !Number.isFinite(quantity) || quantity <= 0) return;

                    const posterProductId = Number(p.product_id);
                    const catalogId =
                        Number.isFinite(posterProductId) && posterProductId > 0
                            ? posterProductId
                            : Number(catalogIdByName.get(normalized) || 0);
                    if (!catalogId || catalogId <= 0) return;
                    if (!catalogIdSet.has(catalogId) && !missingCatalogById.has(catalogId)) {
                        missingCatalogById.set(catalogId, { product_id: catalogId, product_name: name });
                    }

                    manufactures.push({
                        storage_id: storageId,
                        product_id: catalogId,
                        product_name: name,
                        product_name_normalized: normalized,
                        quantity,
                    });
                    totalManufacturedKg += quantity;
                });
            }
        });

        if (manufactures.length === 0) {
            const dateFrom = `${dateStr} 00:00:00`;
            const nextDay = kyivBusinessDateWithOffset(1);
            const dateTo = `${nextDay} 00:00:00`;

            const { data: headers, error: headersError } = await categoriesDb
                .from('manufactures')
                .select('manufacture_id')
                .eq('storage_id', workshopStorageId)
                .gte('manufacture_date', dateFrom)
                .lt('manufacture_date', dateTo);

            if (headersError) {
                throw new Error(`Sadova categories.manufactures fallback failed: ${headersError.message}`);
            }

            const manufactureIds = Array.from(
                new Set((headers || []).map((h: any) => Number(h.manufacture_id)).filter((id: number) => Number.isFinite(id) && id > 0))
            );

            if (manufactureIds.length > 0) {
                const { data: items, error: itemsError } = await categoriesDb
                    .from('manufacture_items')
                    .select('product_id, product_name, quantity, product_num, num, amount')
                    .in('manufacture_id', manufactureIds);

                if (itemsError) {
                    throw new Error(`Sadova categories.manufacture_items fallback failed: ${itemsError.message}`);
                }

                const byNorm = new Map<string, { product_id: number; product_name: string; quantity: number }>();

                (items || []).forEach((row: any) => {
                    const rawName = String(row.product_name || '').trim();
                    const normalized = normalizeSadovaName(rawName);
                    if (!rawName || !normalized) return;

                    const productId =
                        Number.isFinite(Number(row.product_id)) && Number(row.product_id) > 0
                            ? Number(row.product_id)
                            : Number(catalogIdByName.get(normalized) || 0);
                    if (!productId || productId <= 0) return;
                    if (!catalogIdSet.has(productId) && !missingCatalogById.has(productId)) {
                        missingCatalogById.set(productId, { product_id: productId, product_name: rawName });
                    }

                    const quantity =
                        toPositiveNumber(row.quantity) ||
                        toPositiveNumber(row.product_num) ||
                        toPositiveNumber(row.num) ||
                        toPositiveNumber(row.amount);
                    if (quantity <= 0) return;

                    const prev = byNorm.get(normalized);
                    if (prev) {
                        prev.quantity += quantity;
                    } else {
                        byNorm.set(normalized, {
                            product_id: productId,
                            product_name: rawName,
                            quantity,
                        });
                    }
                });

                manufactures = Array.from(byNorm.values()).map((r) => ({
                    storage_id: workshopStorageId,
                    product_id: r.product_id,
                    product_name: r.product_name,
                    product_name_normalized: normalizeSadovaName(r.product_name),
                    quantity: r.quantity,
                }));
                totalManufacturedKg = manufactures.reduce((sum, x) => sum + Number(x.quantity || 0), 0);
            }
        }

        if (missingCatalogById.size > 0) {
            const upsertRows = Array.from(missingCatalogById.values()).map((row) => ({
                product_id: row.product_id,
                category_id: 'auto',
                category_name: 'Auto (from production)',
                product_name: row.product_name,
                portion_size: 1,
                unit: 'кг',
                is_active: true,
                updated_at: new Date().toISOString(),
            }));

            const { error: upsertCatalogError } = await sadovaDb
                .from('production_catalog')
                .upsert(upsertRows, { onConflict: 'product_id' });

            if (upsertCatalogError) {
                throw new Error(`Sadova catalog upsert from live production failed: ${upsertCatalogError.message}`);
            }

            catalogSync.inserted += upsertRows.length;
        }

        const isFullRun = requestedShopIds.length === 0;

        const stocksPayload: any[] = [];
        liveStocks.forEach((stock) => {
            const normalized = String(stock.ingredient_name_normalized || '');
            const ingredientId = Number(stock.ingredient_id);
            const resolvedProductId =
                Number(catalogIdByName.get(normalized) || 0) ||
                (Number.isFinite(ingredientId) && ingredientId > 0 && catalogIdSet.has(ingredientId)
                    ? ingredientId
                    : 0);
            if (!resolvedProductId || resolvedProductId <= 0) return;

            const spotId = mapStorageToSpot.get(stock.storage_id);
            if (spotId === undefined) return;

            stocksPayload.push({
                spot_id: spotId,
                storage_id: stock.storage_id,
                product_id: resolvedProductId,
                product_name: stock.ingredient_name || 'N/A',
                product_name_normalized: normalized,
                ingredient_id: stock.ingredient_id,
                ingredient_name: stock.ingredient_name,
                stock_left: stock.stock_left,
                unit: stock.unit,
                source: 'poster_live',
            });
        });

        const productionPayload: any[] = manufactures.map((m) => ({
            storage_id: m.storage_id,
            product_id: m.product_id,
            product_name: m.product_name,
            product_name_normalized: m.product_name_normalized,
            quantity: m.quantity,
            source: 'poster_live',
        }));

        const { data: rpcBatchId, error: runError } = await sadovaDb.rpc('fn_run_distribution_live', {
            p_business_date: dateStr,
            p_shop_ids: isFullRun ? null : resolvedShopIds,
            p_workshop_storage_id: workshopStorageId,
            p_stocks: stocksPayload,
            p_production: productionPayload,
            p_failed_storages: failedStorages.length > 0 ? failedStorages : null,
        });

        if (runError) {
            throw new Error(`Sadova run RPC failed: ${runError.message}`);
        }

        const batchId = String(rpcBatchId || '');
        if (!batchId) {
            throw new Error('Sadova run RPC returned empty batch_id');
        }

        const { data: logData, error: logError } = await sadovaDb
            .from('distribution_logs')
            .select('products_count, total_kg')
            .eq('batch_id', batchId)
            .single();

        let finalProductsProcessed = 0;
        let finalTotalKg = 0;

        if (!logError && logData) {
            finalProductsProcessed = Number(logData.products_count || 0);
            finalTotalKg = parseFloat(String(logData.total_kg || '0'));
        } else {
            finalProductsProcessed = new Set(productionPayload.map((m) => m.product_name_normalized)).size;
            finalTotalKg = totalManufacturedKg;
        }

        return NextResponse.json({
            success: true,
            batch_id: batchId,
            business_date: dateStr,
            full_run: isFullRun,
            selected_shop_ids: resolvedShopIds,
            products_processed: finalProductsProcessed,
            total_kg: parseFloat(finalTotalKg.toFixed(3)),
            workshop_storage_id: workshopStorageId,
            catalog_sync: catalogSync,
            warnings,
            live_sync: {
                stocks_rows: stocksPayload.length,
                manufactures_rows: productionPayload.length,
                partial_sync: failedStorages.length > 0,
                failed_storages: failedStorages,
            },
        });
    } catch (error: any) {
        console.error('Sadova distribution API error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
