// Next.js uses native fetch, no need for node-fetch

const POSTER_TOKEN = (process.env.POSTER_TOKEN || '').trim();
const POSTER_ACCOUNT = 'galia-baluvana34';

function getKyivDateString(date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(date);
}

export interface PosterStorage {
    storage_id: string;
    storage_name: string;
    storage_adress: string;
    delete: string;
}

export interface PosterLeftover {
    ingredient_id: string;
    ingredient_name: string;
    ingredient_left: string;
    storage_ingredient_left?: string;
    ingredient_unit: string;
}

export interface StorageWithLeftovers {
    storage_id: string;
    storage_name: string;
    leftovers: PosterLeftover[];
}

interface GetAllLeftoversOptions {
    // null means no category filter (all products)
    categoryKeywords?: string[] | null;
}

interface GetTodayManufacturesOptions {
    // null means no category filter (all products)
    categoryKeywords?: string[] | null;
    // null means all storages
    storageId?: number | null;
}

export async function posterRequest(method: string, params: Record<string, string> = {}) {
    if (!POSTER_TOKEN) {
        throw new Error("POSTER_TOKEN environment variable is missing.");
    }

    const url = new URL(`https://${POSTER_ACCOUNT}.joinposter.com/api/${method}`);
    url.searchParams.append('token', POSTER_TOKEN);

    Object.keys(params).forEach(key =>
        url.searchParams.append(key, params[key])
    );

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`Poster API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(`Poster API Error response: ${data.error}`);
    }
    return data;
}

export async function getCategories() {
    console.time('Poster API fetch categories');
    const categoriesData = await posterRequest('menu.getCategories');
    console.timeEnd('Poster API fetch categories');
    return categoriesData.response || [];
}

export async function getProducts() {
    console.time('Poster API fetch products');
    const productsData = await posterRequest('menu.getProducts');
    console.timeEnd('Poster API fetch products');
    return productsData.response || [];
}

async function resolveIngredientIdsByCategoryKeywords(categoryKeywords: string[]): Promise<Set<string>> {
    const normalizedKeywords = categoryKeywords.map((k) => k.toLowerCase());

    const categories = await getCategories();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targetCategories = categories.filter((c: any) =>
        normalizedKeywords.some((kw) => String(c.category_name || '').toLowerCase().includes(kw))
    );
    const targetCategoryIds = new Set(targetCategories.map((c: any) => c.category_id));

    const products = await getProducts();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ingredientIds = products
        .filter((p: any) => targetCategoryIds.has(p.menu_category_id))
        .map((p: any) => p.ingredient_id)
        .filter(Boolean)
        .map(String);

    return new Set(ingredientIds);
}

async function resolveProductIdsByCategoryKeywords(categoryKeywords: string[]): Promise<Set<string>> {
    const normalizedKeywords = categoryKeywords.map((k) => k.toLowerCase());

    const categories = await getCategories();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targetCategories = categories.filter((c: any) =>
        normalizedKeywords.some((kw) => String(c.category_name || '').toLowerCase().includes(kw))
    );
    const targetCategoryIds = new Set(targetCategories.map((c: any) => c.category_id));

    const products = await getProducts();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productIds = products
        .filter((p: any) => targetCategoryIds.has(p.menu_category_id))
        .map((p: any) => p.product_id)
        .filter(Boolean)
        .map(String);

    return new Set(productIds);
}

export async function getAllLeftovers(
    options: GetAllLeftoversOptions = {}
): Promise<StorageWithLeftovers[]> {
    const categoryKeywords = options.categoryKeywords === undefined
        ? ['кондитерка', 'морозиво']
        : options.categoryKeywords;

    const ingredientFilter =
        categoryKeywords && categoryKeywords.length > 0
            ? await resolveIngredientIdsByCategoryKeywords(categoryKeywords)
            : null;

    console.time('Poster API fetch storages');
    const storagesData = await posterRequest('storage.getStorages');
    const allStorages: PosterStorage[] = storagesData.response || [];

    // EXCLUDE factory storage & Tseks from the retail stock calculations
    const storages = allStorages.filter(s => {
        const name = s.storage_name.toLowerCase();
        return !name.includes('склад "кондитерка"') &&
            !name.includes('цех') &&
            !name.includes('переміщення') &&
            !name.includes('списання');
    });
    console.timeEnd('Poster API fetch storages');

    console.time('Poster API fetch leftovers parallel');
    // Паралельно витягуємо залишки з усіх складів
    const promises = storages.map(async (storage) => {
        const data = await posterRequest('storage.getStorageLeftovers', {
            storage_id: storage.storage_id
        });

        // 3. Optional product filtering by category scope
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawLeftovers = (data.response || []) as PosterLeftover[];
        const filteredLeftovers = ingredientFilter
            ? rawLeftovers.filter(item => ingredientFilter.has(String(item.ingredient_id)))
            : rawLeftovers;

        return {
            storage_id: storage.storage_id,
            storage_name: storage.storage_name,
            leftovers: filteredLeftovers
        };
    });

    const results = await Promise.all(promises);
    console.timeEnd('Poster API fetch leftovers parallel');

    return results;
}

export async function getTodayManufactures(
    options: GetTodayManufacturesOptions = {}
) {
    const categoryKeywords = options.categoryKeywords === undefined
        ? ['кондитерка', 'морозиво']
        : options.categoryKeywords;
    const storageId = options.storageId === undefined ? 48 : options.storageId;

    const dateStr = getKyivDateString();
    const productFilter =
        categoryKeywords && categoryKeywords.length > 0
            ? await resolveProductIdsByCategoryKeywords(categoryKeywords)
            : null;

    // Fetch manufactures for today
    console.time('Poster API fetch manufactures');
    const manufacturesData = await posterRequest('storage.getManufactures', {
        dateFrom: dateStr,
        dateTo: dateStr
    });
    console.timeEnd('Poster API fetch manufactures');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manufactures = (manufacturesData.response || []) as any[];

    // Filter by storage (optional)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scopedManufactures = storageId === null
        ? manufactures
        : manufactures.filter((m: any) => String(m.storage_id) === String(storageId));

    // Extract produced items with optional product filtering
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const producedItems: any[] = [];

    for (const manufacture of scopedManufactures) {
        if (manufacture.products && Array.isArray(manufacture.products)) {
            const relevantProducts = productFilter
                ? manufacture.products.filter((p: any) => productFilter.has(String(p.product_id)))
                : manufacture.products;
            producedItems.push(...relevantProducts);
        }
    }

    return producedItems;
}
