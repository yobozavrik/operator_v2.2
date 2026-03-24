import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { posterRequest } from '@/lib/poster-api';

export const dynamic = 'force-dynamic';

interface PosterIngredient {
    structure_id: string;
    ingredient_id: string;
    ingredient_name: string;
    structure_unit: string;
    structure_type: string; // "1" = raw, "2" = semi-finished
    structure_brutto: number;
    structure_netto: number;
    structure_selfprice: string; // kopecks
    ingredients_losses_clear: string;
    ingredients_losses_cook: string;
    ingredients_losses_fry: string;
    ingredients_losses_stew: string;
    ingredients_losses_bake: string;
}

interface PosterMenuProduct {
    product_id: string;
    product_name: string;
    menu_category_id: string;
    price: Record<string, string>; // spot_id -> kopecks
    unit: string;
    ingredients?: PosterIngredient[];
}

interface PosterCategory {
    category_id: string;
    category_name: string;
    parent_category: string;
}

export interface NormProduct {
    product_id: string;
    product_name: string;
    category_id: string;
    category_name: string;
    price: number;          // UAH, menu price
    norm_cost: number;      // UAH, ingredient cost from tech card
    total_cost: number;     // UAH, with labor + overhead
    norm_fc_pct: number;    // ingredient-only FC%
    total_fc_pct: number;   // with labor + overhead
    ingredients_count: number;
    has_tech_card: boolean;
}

export interface NormCategory {
    category_id: string;
    category_name: string;
    products_count: number;
    with_cards: number;
    avg_norm_fc: number;
    avg_total_fc: number;
}

export interface NormativeData {
    products: NormProduct[];
    categories: NormCategory[];
    summary: {
        total_products: number;
        with_cards: number;
        avg_norm_fc: number;
        avg_total_fc: number;
    };
    labor_pct: number;
    overhead_pct: number;
}

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const labor_pct = Math.max(0, Math.min(50, parseFloat(searchParams.get('labor') || '0')));
    const overhead_pct = Math.max(0, Math.min(50, parseFloat(searchParams.get('overhead') || '0')));

    try {
        const [productsData, categoriesData] = await Promise.all([
            posterRequest('menu.getProducts', { type: '2' }),
            posterRequest('menu.getCategories'),
        ]);

        const allCategories: PosterCategory[] = categoriesData.response || [];
        const catNameMap = new Map(allCategories.map(c => [c.category_id, c.category_name]));

        const products: PosterMenuProduct[] = productsData.response || [];

        const normProducts: NormProduct[] = products.map(p => {
            // Get price from first available spot (kopecks → UAH)
            const priceKopecks = p.price ? parseInt(Object.values(p.price)[0] || '0') : 0;
            const price = priceKopecks / 100;

            const ingredients = p.ingredients || [];
            const has_tech_card = ingredients.length > 0;

            // Sum selfprice of all ingredients (kopecks → UAH)
            const norm_cost = ingredients.reduce((sum, ing) => {
                return sum + (parseInt(ing.structure_selfprice) || 0) / 100;
            }, 0);

            const norm_fc_pct = price > 0 ? (norm_cost / price) * 100 : 0;

            // With labor and overhead applied to price
            const labor_cost = price * (labor_pct / 100);
            const overhead_cost = price * (overhead_pct / 100);
            const total_cost = norm_cost + labor_cost + overhead_cost;
            const total_fc_pct = price > 0 ? (total_cost / price) * 100 : 0;

            return {
                product_id: p.product_id,
                product_name: p.product_name,
                category_id: p.menu_category_id,
                category_name: catNameMap.get(p.menu_category_id) || p.menu_category_id,
                price,
                norm_cost,
                total_cost,
                norm_fc_pct,
                total_fc_pct,
                ingredients_count: ingredients.length,
                has_tech_card,
            };
        }).filter(p => p.price > 0); // skip products with no price

        // Group by category
        const catMap = new Map<string, NormProduct[]>();
        for (const p of normProducts) {
            const arr = catMap.get(p.category_id) || [];
            arr.push(p);
            catMap.set(p.category_id, arr);
        }

        const categories: NormCategory[] = Array.from(catMap.entries()).map(([catId, prods]) => {
            const withCards = prods.filter(p => p.has_tech_card);
            return {
                category_id: catId,
                category_name: prods[0].category_name,
                products_count: prods.length,
                with_cards: withCards.length,
                avg_norm_fc: withCards.length > 0
                    ? withCards.reduce((s, p) => s + p.norm_fc_pct, 0) / withCards.length
                    : 0,
                avg_total_fc: withCards.length > 0
                    ? withCards.reduce((s, p) => s + p.total_fc_pct, 0) / withCards.length
                    : 0,
            };
        }).sort((a, b) => b.products_count - a.products_count);

        const withCards = normProducts.filter(p => p.has_tech_card);
        const summary = {
            total_products: normProducts.length,
            with_cards: withCards.length,
            avg_norm_fc: withCards.length > 0
                ? withCards.reduce((s, p) => s + p.norm_fc_pct, 0) / withCards.length
                : 0,
            avg_total_fc: withCards.length > 0
                ? withCards.reduce((s, p) => s + p.total_fc_pct, 0) / withCards.length
                : 0,
        };

        return NextResponse.json({
            products: normProducts.sort((a, b) => b.norm_fc_pct - a.norm_fc_pct),
            categories,
            summary,
            labor_pct,
            overhead_pct,
        } satisfies NormativeData);

    } catch (err: unknown) {
        console.error('Normative FC error:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 }
        );
    }
}
