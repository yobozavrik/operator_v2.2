import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'pizza1' }
});

async function main() {
  console.log("Fetching flags...");
  let { data: flags, error: e1 } = await supabase.from('pizza_oos_logic_flags').select('*');
  if (e1) console.error("Error flags:", e1.message);
  else console.log("Flags count:", flags.length, "Enabled:", flags.filter(f => f.use_oos_logic).length);

  console.log("\nFetching OOS stats limit 5...");
  let { data: statsOos, error: e2 } = await supabase.from('v_pizza_distribution_stats_oos').select('*').limit(5);
  if (e2) console.error("Error oos:", e2.message);
  else console.table(statsOos);

  console.log("\nFetching Merge stats limit 5...");
  let { data: statsMerge, error: e3 } = await supabase.from('v_pizza_distribution_stats').select('*').limit(5);
  if (e3) console.error("Error merge:", e3.message);
  else console.table(statsMerge);
}

main();
