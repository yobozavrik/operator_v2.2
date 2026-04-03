// Test if Supabase pg-meta REST API or direct Postgres connection is available
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://supabase.dmytrotovstytskyi.online';
const SERVICE_ROLE_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2MzI0OTcwMCwiZXhwIjo0OTE4OTIzMzAwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.QC9C9-CxocHb-jM-lHmXHEjEZV2hCOaSwgfxKLjKoEQ';

const sql = readFileSync('./supabase/migrations/20260403_sadova_views_1_basic.sql', 'utf8');

// Split by CREATE OR REPLACE VIEW, skip broken functions section at end
const allParts = sql.split(/(?=CREATE OR REPLACE VIEW )/g);
const views = allParts.filter(s => s.trim().startsWith('CREATE OR REPLACE VIEW'));

console.log(`Found ${views.length} views to create`);

// Try pg-meta API (Supabase Management API for self-hosted)
async function tryPgMeta(sqlStmt) {
    // pg-meta endpoint is typically /pg-meta/v0/query or similar
    const endpoints = [
        `${SUPABASE_URL}/pg-meta/v0/query`,
        `${SUPABASE_URL}/api/pg-meta/v0/query`,
        `${SUPABASE_URL}/rest/v1/rpc/exec_sql`,
    ];
    for (const url of endpoints) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                    'pg': SUPABASE_URL,
                },
                body: JSON.stringify({ query: sqlStmt })
            });
            const text = await res.text();
            console.log(`  URL ${url} -> ${res.status}: ${text.substring(0, 200)}`);
            if (res.ok) return text;
        } catch (e) {
            console.log(`  URL: ${url} -> ERROR: ${e.message}`);
        }
    }
}

// Try discovering what REST endpoints are available
const discoverRes = await fetch(`${SUPABASE_URL}/pg-meta/v0/tables?schema=sadova1&limit=1`, {
    headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    }
});
console.log('\npg-meta tables test:', discoverRes.status, (await discoverRes.text()).substring(0, 300));

// Try SQL via pg-meta
console.log('\nTrying pg-meta SQL...');
await tryPgMeta('SELECT 1 AS test');
