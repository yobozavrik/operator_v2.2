require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase configuration');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function normalizeSpotName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/магазин/gi, '')
    .replace(/[^а-яієїa-z0-9]/gi, '');
}

async function fetchAll(queryBuilderFactory, pageSize = 1000) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await queryBuilderFactory().range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function main() {
  const spots = await fetchAll(() =>
    supabase
      .schema('categories')
      .from('spots')
      .select('spot_id, name')
      .not('name', 'ilike', '%test%')
      .not('name', 'ilike', '%тест%')
      .order('spot_id', { ascending: true })
  );

  const storages = await fetchAll(() =>
    supabase
      .schema('categories')
      .from('storages')
      .select('storage_id, storage_name')
      .order('storage_id', { ascending: true })
  );

  const viewRows = await fetchAll(() =>
    supabase
      .schema('konditerka1')
      .from('v_konditerka_distribution_stats')
      .select('spot_id, spot_name, storage_id')
  );

  const distinctViewSpots = new Map();
  viewRows.forEach((row) => {
    const spotId = Number(row.spot_id);
    if (!Number.isFinite(spotId) || spotId <= 0) return;
    if (!distinctViewSpots.has(spotId)) {
      distinctViewSpots.set(spotId, {
        spot_id: spotId,
        spot_name: row.spot_name,
        storage_id: row.storage_id,
      });
    }
  });

  const storagesByNormalized = new Map();
  storages.forEach((row) => {
    const normalized = normalizeSpotName(row.storage_name);
    if (!normalized) return;
    if (!storagesByNormalized.has(normalized)) storagesByNormalized.set(normalized, []);
    storagesByNormalized.get(normalized).push({
      storage_id: Number(row.storage_id),
      storage_name: row.storage_name,
    });
  });

  const matched = [];
  const unmatched = [];

  spots.forEach((spot) => {
    const normalized = normalizeSpotName(spot.name);
    const storageMatches = storagesByNormalized.get(normalized) || [];
    const inView = distinctViewSpots.has(Number(spot.spot_id));

    const row = {
      spot_id: Number(spot.spot_id),
      spot_name: spot.name,
      normalized,
      storage_matches: storageMatches,
      in_view: inView,
    };

    if (storageMatches.length > 0) matched.push(row);
    else unmatched.push(row);
  });

  const missingFromView = matched.filter((row) => !row.in_view);

  console.log(JSON.stringify({
    total_spots: spots.length,
    matched_to_storage: matched.length,
    unmatched_spots: unmatched.length,
    distinct_view_spots: distinctViewSpots.size,
    missing_from_view_count: missingFromView.length,
    missing_from_view: missingFromView,
    unmatched: unmatched,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
