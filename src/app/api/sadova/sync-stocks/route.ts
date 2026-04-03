import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';
import {
    extractSadovaManufactureProducts,
    normalizeSadovaName,
    syncSadovaCatalogFromManufactures,
} from '../../../../lib/sadova-catalog';
import { extractSadovaEdgeProduction } from '../../../../lib/sadova-live-edge';

export const dynamic = 'force-dynamic';

const POSTER_TOKEN = process.env.POSTER_TOKEN || '';
const POSTER_ACCOUNT = 'galia-baluvana34';

// Supabase client will be initialized inside the handler
function isSadovaProductionStorageName(value: unknown): boolean {
    const normalized = normalizeSadovaName(String(value || ''));
    return normalized.includes('садова');
}

async function posterRequest(method: string, params: Record<string, string> = {}) {
    if (!POSTER_TOKEN) {
        throw new Error("POSTER_TOKEN environment variable is missing.");
    }

    const url = new URL(`https://${POSTER_ACCOUNT}.joinposter.com/api/${method}`);
    url.searchParams.append('token', POSTER_TOKEN);

    Object.keys(params).forEach(key =>
        url.searchParams.append(key, params[key])
    );

    // Add cache-busting parameter
    url.searchParams.append('_t', Date.now().toString());

    // Disable Next.js fetch caching
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

    return authHeader === `Bearer ${secret}` || headerSecret === secret;
}
export async function POST(request: Request) {
    try {
        if (!hasInternalApiAccess(request)) {
            const auth = await requireAuth();
            if (auth.error) return auth.error;
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Missing Supabase service credentials');
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);

        // 5.2. Fetch active shops
        const sadovaDb = supabase.schema('sadova1');
        const categoriesDb = supabase.schema('categories');

        const { data: shopRows, error: shopsError } = await sadovaDb
            .from('distribution_shops')
            .select('spot_id, storage_id')
            .eq('is_active', true)
            .not('storage_id', 'is', null);

        if (shopsError) throw new Error(`Error fetching shops: ${shopsError.message}`);
        if (!shopRows || shopRows.length === 0) throw new Error('No active sadova shops found.');

        const spotIds = Array.from(new Set(shopRows.map((row: any) => Number(row.spot_id))));
        const storageIds = Array.from(new Set(shopRows.map((row: any) => Number(row.storage_id))));

        const [spotsResult, storagesResult] = await Promise.all([
            categoriesDb
                .from('spots')
                .select('spot_id, name')
                .in('spot_id', spotIds),
            categoriesDb
                .from('storages')
                .select('storage_id, storage_name')
                .in('storage_id', storageIds),
        ]);

        if (spotsResult.error) throw new Error(`Error fetching spots: ${spotsResult.error.message}`);
        if (storagesResult.error) throw new Error(`Error fetching storages: ${storagesResult.error.message}`);

        const spotNameById = new Map<number, string>(
            (spotsResult.data || []).map((spot: any) => [Number(spot.spot_id), String(spot.name || '')])
        );
        const storageNameById = new Map<number, string>(
            (storagesResult.data || []).map((storage: any) => [Number(storage.storage_id), String(storage.storage_name || '')])
        );

        const baseShops = shopRows.map((row: any) => ({
            spot_id: Number(row.spot_id),
            storage_id: Number(row.storage_id),
            storage_name: storageNameById.get(Number(row.storage_id)) || `Storage ${row.storage_id}`,
            spot_name: spotNameById.get(Number(row.spot_id)) || `Spot ${row.spot_id}`,
        }));

        const productionStorageId =
            baseShops.find((shop) => shop.storage_id === 2)?.storage_id
            ?? baseShops.find((shop) => isSadovaProductionStorageName(shop.storage_name))?.storage_id
            ?? 2;

        const shopsRaw = baseShops.map((shop) => ({
            ...shop,
            is_production_hub:
                shop.storage_id === productionStorageId ||
                isSadovaProductionStorageName(shop.storage_name),
        }));

        // 5.4. Call Edge Function for live stocks
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

            // 5.6. Check for partial failure or missing payload
            if (!edgeResult || !edgeResult.storages_status) {
                throw new Error("Edge Function returned invalid payload.");
            }

            // 5.6. Track storages that still need fetching
            let pendingStorages = [...storageIds];

            // 5.7. Mark storages successful from Edge Function
            const storagesStatus = edgeResult.storages_status || [];
            const edgeSuccessfulIds = storagesStatus
                .filter((s: any) => s.status === 'success')
                .map((s: any) => s.storage_id);

            pendingStorages = pendingStorages.filter(id => !edgeSuccessfulIds.includes(id));

            // 5.8. Normalize successfully fetched live stocks from Edge Function
            liveStocks = (edgeResult.rows || []).map((item: any) => ({
                storage_id: item.storage_id,
                ingredient_id: item.ingredient_id,
                ingredient_name: item.ingredient_name,
                ingredient_name_normalized: normalizeSadovaName(item.ingredient_name),
                stock_left: parseFloat(item.stock_left || item.ingredient_left || item.storage_ingredient_left || '0') / 1000,
                unit: item.unit || item.ingredient_unit || 'кг'
            }));

            // --- FALLBACK: Fetch missing/failed storages directly from Poster ---
            if (pendingStorages.length > 0) {
                console.warn(`Edge Function failed for [${pendingStorages.join(', ')}]. Falling back to direct API.`);
                const fallbacks = [...pendingStorages];
                for (const storageId of fallbacks) {
                    try {
                        const directData = await posterRequest('storage.getStorageLeftovers', {
                            storage_id: String(storageId)
                        });
                        if (directData && directData.response) {
                            const normalizedDirect = (directData.response || []).map((item: any) => ({
                                storage_id: storageId,
                                ingredient_id: parseInt(item.ingredient_id),
                                ingredient_name: item.ingredient_name,
                                ingredient_name_normalized: normalizeSadovaName(item.ingredient_name),
                                stock_left: parseFloat(item.stock_left || item.ingredient_left || item.storage_ingredient_left || '0') / 1000,
                                unit: item.unit || 'кг'
                            }));
                            liveStocks.push(...normalizedDirect);
                            // Mark as success (remove from pending)
                            pendingStorages = pendingStorages.filter(id => id !== storageId);
                        }
                    } catch (directErr) {
                        console.error(`Direct fallback failed for storage ${storageId}:`, directErr);
                    }
                }
            }

            failed_storages = pendingStorages;


        } catch (err: any) {
            console.error("Edge Function Error:", err);
            throw new Error(`Live stocks sync failed: ${err.message}`);
        }

        // 5.8. Fetch manufactures for today (Europe/Kyiv timezone)
        const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
        const manufactures: any[] = [];
        let manufactures_warning = false;
        let rawManufactures: any[] = [];
        let catalog_sync = { inserted: 0, renamed: 0, reactivated: 0, skipped_without_id: 0 };
        let catalog: Array<{
            product_id: number;
            product_name: string;
            product_name_normalized: string;
            is_active: boolean;
        }> = [];
        const production_summary = {
            total_kg: 0,
            storage_id: productionStorageId,
            items_count: 0
        };

        let production_source: 'live_edge' | 'live_poster' | 'db_cache' | 'empty' = 'empty';
        let last_synced_at: string | null = null;

        try {
            const { data: catalogRaw, error: catalogError } = await sadovaDb
                .from('production_catalog')
                .select('product_id, product_name, is_active')
                .eq('is_active', true);

            if (catalogError) throw new Error(`Error fetching catalog: ${catalogError.message}`);

            catalog = (catalogRaw || []).map((c: any) => ({
                product_id: c.product_id,
                product_name: c.product_name,
                product_name_normalized: normalizeSadovaName(c.product_name),
                is_active: c.is_active
            }));

            const catalogNamesNormalized = new Set(catalog.map((c: any) => c.product_name_normalized));
            const edgeManufactures = extractSadovaEdgeProduction(liveEdgePayload, productionStorageId);

            if (edgeManufactures.length > 0) {
                edgeManufactures.forEach((item) => {
                    if (!catalogNamesNormalized.has(item.product_name_normalized)) return;

                    manufactures.push({
                        storage_id: item.storage_id ?? productionStorageId,
                        product_id: item.product_id ?? undefined,
                        product_name: item.product_name,
                        product_name_normalized: item.product_name_normalized,
                        quantity: item.quantity / 1000,
                    });

                    production_summary.total_kg += item.quantity;
                    production_summary.items_count++;
                });
                if (manufactures.length > 0) production_source = 'live_edge';
                else console.warn('[sync-stocks] Edge manufactures не сматчились з каталогом');
            } else {
                console.log('[sync-stocks] Edge не повернув manufactures, пробуємо прямий Poster API');
                let manufacturesData: any;
                try {
                    manufacturesData = await posterRequest('storage.getManufactures', {
                        dateFrom: dateStr,
                        dateTo: dateStr
                    });
                } catch (posterErr: any) {
                    console.error('[sync-stocks] Poster getManufactures запит впав:', posterErr.message);
                    throw posterErr;
                }

                rawManufactures = (manufacturesData.response || []) as any[];
                if (rawManufactures.length === 0) {
                    console.warn('[sync-stocks] Poster getManufactures повернув []');
                }

                catalog_sync = await syncSadovaCatalogFromManufactures(
                    sadovaDb,
                    categoriesDb,
                    rawManufactures,
                    productionStorageId
                );

                const flattenedManufactures = extractSadovaManufactureProducts(
                    rawManufactures,
                    productionStorageId
                );

                flattenedManufactures.forEach((item) => {
                    const name = item.product_name || '';
                    const normalized = normalizeSadovaName(name);
                    const quantity = (Number(item.product_num) || 0) / 1000;

                    if (!name || quantity <= 0) return;

                    // Only items in the active Sadova catalog
                    if (!catalogNamesNormalized.has(normalized)) return;

                    manufactures.push({
                        storage_id: item.storage_id ?? productionStorageId,
                        product_id: item.product_id ?? undefined,
                        product_name: name,
                        product_name_normalized: normalized,
                        quantity,
                    });

                    production_summary.total_kg += quantity;
                    production_summary.items_count++;
                });

                if (manufactures.length > 0) {
                    production_source = 'live_poster';
                } else if (flattenedManufactures.length > 0) {
                    console.warn('[sync-stocks] Poster manufactures є, але жоден не сматчився з каталогом');
                }
            }

            // Clean up numbers
            production_summary.total_kg = parseFloat(production_summary.total_kg.toFixed(3));

            // Зберегти виробництво в БД
            if (manufactures.length > 0) {
                const nowIso = new Date().toISOString();
                last_synced_at = nowIso;
                const dbRows = manufactures.map((m: any) => ({
                    business_date: dateStr,
                    storage_id: m.storage_id,
                    product_name_normalized: m.product_name_normalized,
                    product_name: m.product_name,
                    quantity_kg: m.quantity,
                    synced_at: nowIso,
                }));

                const { error: upsertError } = await sadovaDb
                    .from('production_daily')
                    .upsert(dbRows, { onConflict: 'business_date,storage_id,product_name_normalized' });

                if (upsertError) {
                    console.error('Error saving production_daily:', upsertError);
                    // Не кидаємо помилку — це некритично для основного синку
                }
            }

        } catch (err) {
            console.error("Error fetching manufactures:", err);
            manufactures_warning = true;
            production_summary.total_kg = 0;
            production_summary.items_count = 0;
        }

        // Fallback: якщо live manufactures порожні — читаємо кеш з production_daily
        if (manufactures.length === 0) {
            console.log('[sync-stocks] manufactures порожні, читаємо кеш з production_daily');
            const { data: cachedRows, error: cacheErr } = await sadovaDb
                .from('production_daily')
                .select('storage_id, product_name, product_name_normalized, quantity_kg, synced_at')
                .eq('business_date', dateStr)
                .eq('storage_id', productionStorageId)
                .order('quantity_kg', { ascending: false });

            if (!cacheErr && cachedRows && cachedRows.length > 0) {
                cachedRows.forEach((r: any) => {
                    manufactures.push({
                        storage_id: r.storage_id,
                        product_name: r.product_name,
                        product_name_normalized: r.product_name_normalized,
                        quantity: r.quantity_kg,
                    });
                    production_summary.total_kg += Number(r.quantity_kg || 0);
                    production_summary.items_count++;
                });
                production_summary.total_kg = parseFloat(production_summary.total_kg.toFixed(3));
                production_source = 'db_cache';
                last_synced_at = cachedRows[0]?.synced_at ?? null;
                console.log(`[sync-stocks] Повернено ${cachedRows.length} рядків з кешу`);
            } else {
                production_source = 'empty';
            }
        }

        if (catalog.length === 0) {
            const { data: catalogRaw, error: catalogError } = await sadovaDb
                .from('production_catalog')
                .select('product_id, product_name, is_active')
                .eq('is_active', true);

            if (catalogError) throw new Error(`Error fetching catalog: ${catalogError.message}`);

            catalog = (catalogRaw || []).map((c: any) => ({
                product_id: c.product_id,
                product_name: c.product_name,
                product_name_normalized: normalizeSadovaName(c.product_name),
                is_active: c.is_active
            }));
        }

        // 5.10. Return unified payload
        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            production_source,
            last_synced_at,
            shops: shopsRaw.map((s: any) => ({
                spot_id: s.spot_id,
                storage_id: s.storage_id,
                spot_name: s.spot_name,
                storage_name: s.storage_name,
                is_production_hub: !!s.is_production_hub
            })),
            catalog,
            live_stocks: liveStocks,
            manufactures,
            production_summary,
            catalog_sync,
            manufactures_warning,
            partial_sync: failed_storages.length > 0,
            failed_storages
        });

    } catch (error: any) {
        console.error("Sadova Sync Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}



