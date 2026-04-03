import { posterRequest } from '@/lib/poster-api';

export interface KonditerkaStoreRevenueRow {
    spotId: number;
    spotName: string;
    revenue: number;
    rank: number;
}

type PosterSpotRow = {
    spot_id?: string | number;
    name?: string;
    spot_delete?: string | number;
};

type PosterSalesRow = {
    payed_sum?: string | number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedRanking: { fetchedAt: number; rows: KonditerkaStoreRevenueRow[] } | null = null;
let inFlight: Promise<KonditerkaStoreRevenueRow[]> | null = null;

function toPositiveInt(value: unknown): number {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.floor(raw);
}

function toMoney(value: unknown): number {
    const raw = Number(value);
    return Number.isFinite(raw) ? raw / 100 : 0;
}

function getKyivDateString(date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(date);
}

function shiftIsoDate(isoDate: string, days: number): string {
    const [year, month, day] = isoDate.split('-').map((part) => Number(part));
    if (![year, month, day].every((part) => Number.isFinite(part))) {
        return isoDate;
    }

    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

async function loadPosterStoreRevenueRanking(): Promise<KonditerkaStoreRevenueRow[]> {
    const endDate = getKyivDateString();
    const startDate = shiftIsoDate(endDate, -13);

    const spotsPayload = await posterRequest('spots.getSpots');
    const spots = Array.isArray(spotsPayload.response)
        ? (spotsPayload.response as PosterSpotRow[])
        : [];

    const activeSpots = spots
        .map((spot) => ({
            spotId: toPositiveInt(spot.spot_id),
            spotName: String(spot.name || '').trim(),
            deleted: toPositiveInt(spot.spot_delete),
        }))
        .filter((spot) => spot.spotId > 0 && spot.spotName && spot.deleted === 0);

    const rows = await Promise.all(
        activeSpots.map(async (spot) => {
            try {
                const payload = await posterRequest('dash.getProductsSales', {
                    dateFrom: startDate,
                    dateTo: endDate,
                    spot_id: String(spot.spotId),
                });

                const salesRows = Array.isArray(payload.response)
                    ? (payload.response as PosterSalesRow[])
                    : [];

                const revenue = salesRows.reduce((sum, row) => sum + toMoney(row.payed_sum), 0);
                return {
                    spotId: spot.spotId,
                    spotName: spot.spotName,
                    revenue,
                    rank: 0,
                };
            } catch {
                return {
                    spotId: spot.spotId,
                    spotName: spot.spotName,
                    revenue: 0,
                    rank: 0,
                };
            }
        })
    );

    return rows
        .sort((a, b) => b.revenue - a.revenue || a.spotId - b.spotId)
        .map((row, index) => ({
            ...row,
            rank: index + 1,
        }));
}

export async function fetchKonditerkaStoreRevenueRanking(
    forceRefresh = false
): Promise<KonditerkaStoreRevenueRow[]> {
    const now = Date.now();
    if (!forceRefresh && cachedRanking && now - cachedRanking.fetchedAt < CACHE_TTL_MS) {
        return cachedRanking.rows;
    }

    if (!forceRefresh && inFlight) {
        return inFlight;
    }

    inFlight = loadPosterStoreRevenueRanking();
    try {
        const rows = await inFlight;
        cachedRanking = { fetchedAt: Date.now(), rows };
        return rows;
    } finally {
        inFlight = null;
    }
}

export async function fetchKonditerkaStoreRevenuePriorityMap(
    forceRefresh = false
): Promise<Map<number, number>> {
    const ranking = await fetchKonditerkaStoreRevenueRanking(forceRefresh);
    return new Map(ranking.map((row) => [row.spotId, row.rank]));
}
