require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase URL or anon key');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const { data, error } = await supabase.rpc('f_generate_order_plan_konditerka', { p_days: 1 });
  if (error) throw error;

  console.log(JSON.stringify((data || []).slice(0, 40), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
