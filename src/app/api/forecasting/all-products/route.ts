import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const supabase = await createClient();

    const { data: products, error: prodError } = await supabase
      .schema('categories')
      .from('products')
      .select('id, name, weight_flag, category_id') as { data: any[] | null, error: any };

    if (prodError || !products) {
      console.error('Supabase products error:', prodError);
      return NextResponse.json({ error: prodError?.message || 'No products found' }, { status: 500 });
    }

    const { data: categories, error: catError } = await supabase
      .schema('categories')
      .from('categories')
      .select('category_id, category_name') as { data: any[] | null, error: any };

    if (catError || !categories) {
      console.error('Supabase categories error:', catError);
      return NextResponse.json({ error: catError?.message || 'No categories found' }, { status: 500 });
    }

    const catMap = new Map<string, string>(
      categories.map((c: { category_id: string; category_name: string }) => [c.category_id, c.category_name])
    );

    const mappedData = products.map((row: { id: string; name: string; weight_flag: boolean; category_id: string }) => ({
      sku_id: row.id,
      product_name: row.name,
      category_name: catMap.get(row.category_id) || 'Other',
      weight_flag: row.weight_flag,
    }));

    return NextResponse.json(mappedData);
  } catch (err: any) {
    console.error('Critical API Error:', err);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: err.message,
      },
      { status: 500 },
    );
  }
}
