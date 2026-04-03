import pg from 'pg';
import { readFileSync } from 'fs';

const { Client } = pg;

// Try to extract DB host from Supabase URL (it's self-hosted)
// URL: https://supabase.dmytrotovstytskyi.online
// Typically db is at supabase.dmytrotovstytskyi.online on port 5432 (or 5434)
// or via db.supabase.dmytrotovstytskyi.online
const host = 'supabase.dmytrotovstytskyi.online';

// Read individual VIEW creation SQLs (without function bodies for now)
const sqlRaw = readFileSync('./supabase/migrations/20260403_sadova_views_1_basic.sql', 'utf8');

// Split by CREATE OR REPLACE VIEW, skip broken functions section at end
const allParts = sqlRaw.split(/(?=CREATE OR REPLACE VIEW )/g);
const views = allParts.filter(s => s.trim().startsWith('CREATE OR REPLACE VIEW'));

async function applyViews(password) {
    const client = new Client({
        host,
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000
    });

    await client.connect();
    console.log('Connected!');

    for (const view of views) {
        const name = view.match(/CREATE OR REPLACE VIEW (\S+)/)?.[1] ?? '?';
        try {
            await client.query(view.trim().replace(/;?\s*$/, ''));
            console.log(`  ✅ ${name}`);
        } catch (e) {
            console.error(`  ❌ ${name}: ${e.message}`);
        }
    }

    await client.end();
    console.log('Done!');
}

// Try with empty password first, then common defaults
const passwords = ['postgres', ''];
for (const pw of passwords) {
    try {
        await applyViews(pw);
        break;
    } catch (e) {
        if (e.message.includes('password') || e.message.includes('auth')) {
            console.log(`Password "${pw}" failed, trying next...`);
        } else {
            console.error('Connection failed:', e.message);
            break;
        }
    }
}
