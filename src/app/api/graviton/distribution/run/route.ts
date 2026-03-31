import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';
import crypto, { timingSafeEqual } from 'crypto';
import { normalizeGravitonName, syncGravitonCatalogFromManufactures } from '@/lib/graviton-catalog';
import { extractGravitonEdgeProduction } from '@/lib/graviton-live-edge';

export const dynamic = 'force-dynamic';

const POSTER_TOKEN = process.env.POSTER_TOKEN || '';
const POSTER_ACCOUNT = 'galia-baluvana34';

async function posterRequest(method: string, params: Record<string, string> = {}) {
    if (!POSTER_TOKEN) {
        throw new Error("POSTER_TOKEN environment variable is missing.");
    }

    const url = new URL(`https://${POSTER_ACCOUNT}.joinposter.com/api/${method}`);
    url.searchParams.append('token', POSTER_TOKEN);

    Object.keys(params).forEach(key =>
        url.searchParams.append(key, params[key])
    );

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
export async function POST(request: Request) {
    try {
        if (!hasInternalApiAccess(request)) {
            const auth = await requireAuth();
            if (auth.error) return auth.error;
        }
        const body = await request.json().catch(() => ({}));
        let requestedShopIds: number[] | null = null;

        if (body && Array.isArray(body.shop_ids) && body.shop_ids.length > 0) {
            requestedShopIds = body.shop_ids;
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Missing Supabase service credentials');
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const gravitonDb = supabase.schema('graviton');

        // 1. Fetch active shops
        const categoriesDb = supabase.schema('categories');

        const { data: shopRows, error: shopsError } = await gravitonDb
            .from('distribution_shops')
            .select('spot_id, storage_id')
            .eq('is_active', true)
            .not('storage_id', 'is', null);

        if (shopsError) throw new Error(`Error fetching shops: ${shopsError.message}`);
        if (!shopRows || shopRows.length === 0) throw new Error('No active graviton shops found in DB.');

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

        // 2. Determine effective scope
        let activeShops = shopsRaw as any[];
        if (requestedShopIds && requestedShopIds.length > 0) {
            activeShops = activeShops.filter((s) => requestedShopIds.includes(s.spot_id));
        }

        if (activeShops.length === 0) {
            return NextResponse.json({ success: false, error: 'No matching active shops found for the requested subset.' }, { status: 400 });
        }

        const storageIds = activeShops.map((s: any) => s.storage_id);
        const resolvedShopIds = activeShops.map((s: any) => s.spot_id);
        const mapStorageToSpot = new Map(activeShops.map((s) => [s.storage_id, s.spot_id]));

        // 3. Fetch live stocks for effective scope
        let liveStocks: any[] = [];
        let failed_storages: number[] = [];
        let liveEdgePayload: any = null;

        try {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/poster-live-stocks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ storage_ids: storageIds })
            });

            if (!edgeResponse.ok) {
                throw new Error(`Edge Function returned HTTP ${edgeResponse.status}`);
            }

            const edgeResult = await edgeResponse.json();
            liveEdgePayload = edgeResult;

            if (!edgeResult || !edgeResult.storages_status) {
                throw new Error("Edge Function returned invalid payload.");
            }

            let pendingStorages = [...storageIds];
            const storagesStatus = edgeResult.storages_status || [];
            const edgeSuccessfulIds = storagesStatus
                .filter((s: any) => s.status === 'success')
                .map((s: any) => s.storage_id);

            pendingStorages = pendingStorages.filter(id => !edgeSuccessfulIds.includes(id));

            liveStocks = (edgeResult.rows || []).map((item: any) => ({
                storage_id: item.storage_id,
                ingredient_id: item.ingredient_id,
                ingredient_name: item.ingredient_name,
                ingredient_name_normalized: normalizeGravitonName(item.ingredient_name),
                stock_left: parseFloat(item.stock_left || item.ingredient_left || item.storage_ingredient_left || '0'),
                unit: item.unit || item.ingredient_unit || 'кг'
            }));

            // Direct Fallback
            if (pendingStorages.length > 0) {
                console.warn(`Edge Function failed for [${pendingStorages.join(', ')}]. Falling back to direct API.`);
                for (const storageId of pendingStorages) {
                    try {
                        const directData = await posterRequest('storage.getStorageLeftovers', {
                            storage_id: String(storageId)
                        });
                        if (directData && directData.response) {
                            const normalizedDirect = (directData.response || []).map((item: any) => ({
                                storage_id: storageId,
                                ingredient_id: parseInt(item.ingredient_id),
                                ingredient_name: item.ingredient_name,
                                ingredient_name_normalized: normalizeGravitonName(item.ingredient_name),
                                stock_left: parseFloat(item.stock_left || item.ingredient_left || item.storage_ingredient_left || '0'),
                                unit: item.unit || 'кг'
                            }));
                            liveStocks.push(...normalizedDirect);
                            pendingStorages = pendingStorages.filter(id => id !== storageId);
                        }
                    } catch (directErr) {
                        console.error(`Direct fallback failed for storage ${storageId}:`, directErr);
                    }
                }
            }

            failed_storages = pendingStorages;

        } catch (err: any) {
            console.error("Live stock fetch failed:", err);
            // We can decide to either hard fail or proceed with empty stocks. For distribution, missing stocks is dangerous.
            throw new Error(`Critical dependency Live stocks sync failed: ${err.message}`);
        }

        // 4. Fetch live production (storage_id = 2)
        const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
        let rawManufactures: any[] = [];
        let catalogSync = { inserted: 0, renamed: 0, reactivated: 0, skipped_without_id: 0 };

        try {
            const edgeManufactures = extractGravitonEdgeProduction(liveEdgePayload, 2);
            if (edgeManufactures.length === 0) {
                const manufacturesData = await posterRequest('storage.getManufactures', {
                    dateFrom: dateStr,
                    dateTo: dateStr
                });

                rawManufactures = (manufacturesData.response || []) as any[];
                catalogSync = await syncGravitonCatalogFromManufactures(gravitonDb, categoriesDb, rawManufactures, 2);
            }
        } catch (err: any) {
            console.error("Error fetching manufactures for catalog sync:", err);
            throw new Error(`Critical dependency Live production sync failed: ${err.message}`);
        }

        // 5. Fetch active catalog (after auto-sync)
        const { data: catalogRaw, error: catalogError } = await gravitonDb
            .from('production_catalog')
            .select('product_id, product_name')
            .eq('is_active', true);

        if (catalogError) throw new Error(`Error fetching catalog: ${catalogError.message}`);

        const catalogNamesNormalized = new Set<string>();
        const catalogData = new Map<string, number>();
        (catalogRaw || []).forEach((c: any) => {
            const norm = normalizeGravitonName(c.product_name);
            catalogNamesNormalized.add(norm);
            catalogData.set(norm, c.product_id);
        });

        const manufactures: any[] = [];
        let totalManufacturedKg = 0;

        try {
            const edgeManufactures = extractGravitonEdgeProduction(liveEdgePayload, 2);

            if (edgeManufactures.length > 0) {
                edgeManufactures.forEach((item) => {
                    if (!catalogNamesNormalized.has(item.product_name_normalized)) return;
                    const catalogId = catalogData.get(item.product_name_normalized);
                    manufactures.push({
                        storage_id: item.storage_id ?? 2,
                        product_id: catalogId || item.product_id || undefined,
                        product_name: item.product_name,
                        product_name_normalized: item.product_name_normalized,
                        quantity: item.quantity,
                    });
                    totalManufacturedKg += item.quantity;
                });
            } else {
                rawManufactures.forEach((m: any) => {
                    const storageId = parseInt(m.storage_id);
                    if (storageId !== 2) return;

                    if (m.products && Array.isArray(m.products)) {
                        m.products.forEach((p: any) => {
                            const name = p.product_name || p.ingredient_name || '';
                            const normalized = normalizeGravitonName(name);
                            const quantity = parseFloat(p.product_num || '0');

                            if (name && catalogNamesNormalized.has(normalized)) {
                                const catalogId = catalogData.get(normalized);
                                manufactures.push({
                                    storage_id: storageId,
                                    product_id: catalogId || (p.product_id ? parseInt(p.product_id) : undefined),
                                    product_name: name,
                                    product_name_normalized: normalized,
                                    quantity: quantity
                                });
                                totalManufacturedKg += quantity;
                            }
                        });
                    }
                });
            }
        } catch (err: any) {
            console.error("Error fetching manufactures:", err);
            throw new Error(`Critical dependency Live production sync failed: ${err.message}`);
        }

        // 6. Generate Batch ID
        const batchId = crypto.randomUUID();

        // 7. Insert Input Snapshot Stocks
        const stocksToInsert: any[] = [];
        liveStocks.forEach(stock => {
            if (catalogNamesNormalized.has(stock.ingredient_name_normalized)) {
                const spotId = mapStorageToSpot.get(stock.storage_id);
                if (spotId !== undefined) {
                    stocksToInsert.push({
                        batch_id: batchId,
                        business_date: dateStr,
                        spot_id: spotId,
                        storage_id: stock.storage_id,
                        product_id: catalogData.get(stock.ingredient_name_normalized) || null,
                        product_name: stock.ingredient_name || stock.product_name || 'N/A',
                        product_name_normalized: stock.ingredient_name_normalized,
                        ingredient_id: stock.ingredient_id,
                        ingredient_name: stock.ingredient_name,
                        stock_left: stock.stock_left,
                        unit: stock.unit,
                        source: 'poster_live'
                    });
                }
            }
        });

        if (stocksToInsert.length > 0) {
            const { error: stocksInsertError } = await gravitonDb
                .from('distribution_input_stocks')
                .insert(stocksToInsert);

            if (stocksInsertError) {
                console.error("Error inserting snapshot stocks:", stocksInsertError);
                throw new Error(`Critical database error inserting stocks: ${stocksInsertError.message}`);
            }
        }

        // 8. Insert Input Snapshot Production
        const manufacturesToInsert: any[] = manufactures.map(m => ({
            batch_id: batchId,
            business_date: dateStr,
            storage_id: m.storage_id,
            product_id: m.product_id,
            product_name: m.product_name,
            product_name_normalized: m.product_name_normalized,
            quantity: m.quantity,
            source: 'poster_live'
        }));

        if (manufacturesToInsert.length > 0) {
            const { error: prodInsertError } = await gravitonDb
                .from('distribution_input_production')
                .insert(manufacturesToInsert);

            if (prodInsertError) {
                console.error("Error inserting snapshot production:", prodInsertError);
                throw new Error(`Critical database error inserting production: ${prodInsertError.message}`);
            }
        }

        // 9. Insert Meta
        const { error: metaInsertError } = await gravitonDb
            .from('distribution_run_meta')
            .insert({
                batch_id: batchId,
                business_date: dateStr,
                selected_shop_ids: resolvedShopIds.length > 0 ? resolvedShopIds : null,
                full_run: !requestedShopIds || requestedShopIds.length === 0,
                stocks_rows: stocksToInsert.length,
                manufactures_rows: manufacturesToInsert.length,
                partial_sync: failed_storages.length > 0,
                failed_storages: failed_storages.length > 0 ? failed_storages : null
            });

        if (metaInsertError) {
            console.error("Error inserting snapshot meta:", metaInsertError);
            throw new Error(`Critical database error inserting run meta: ${metaInsertError.message}`);
        }

        // 10. Run orchestration
        const isFullRun = !requestedShopIds || requestedShopIds.length === 0;
        const { error: runError } = await gravitonDb.rpc('fn_orchestrate_distribution_live', {
            p_batch_id: batchId,
            p_business_date: dateStr,
            p_shop_ids: isFullRun ? null : resolvedShopIds
        });

        if (runError) {
            throw new Error(`Distribution calculation failed: ${runError.message}`);
        }

        // 11. Fetch actual distribution metrics from logs
        const { data: logData, error: logError } = await gravitonDb
            .from('distribution_logs')
            .select('products_count, total_kg')
            .eq('batch_id', batchId)
            .single();

        let finalProductsProcessed = 0;
        let finalTotalKg = 0;

        if (!logError && logData) {
            finalProductsProcessed = logData.products_count || 0;
            finalTotalKg = parseFloat(logData.total_kg || '0');
        } else {
            console.warn("Failed to retrieve distribution log metrics, falling back to input estimates", logError);
            finalProductsProcessed = new Set(manufacturesToInsert.map(m => m.product_name_normalized)).size;
            finalTotalKg = totalManufacturedKg;
        }

        // Return Summary
        return NextResponse.json({
            success: true,
            batch_id: batchId,
            business_date: dateStr,
            full_run: !requestedShopIds || requestedShopIds.length === 0,
            selected_shop_ids: resolvedShopIds,
            products_processed: finalProductsProcessed,
            total_kg: parseFloat(finalTotalKg.toFixed(3)),
            catalog_sync: catalogSync,
            live_sync: {
                stocks_rows: stocksToInsert.length,
                manufactures_rows: manufacturesToInsert.length,
                partial_sync: failed_storages.length > 0,
                failed_storages
            }
        });

    } catch (error: any) {
        console.error("Distribution API Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}





