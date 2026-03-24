#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createClient } from '@supabase/supabase-js';

function getEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseBool(value, defaultValue) {
  if (value === undefined) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, '');
}

const supabaseUrl = getEnv('SUPABASE_URL');
const supabaseKey = getEnv('SUPABASE_ANON_KEY') ?? getEnv('SUPABASE_SERVICE_KEY');
const allowMutations = parseBool(getEnv('SUPABASE_ALLOW_MUTATIONS'), false);
const allowedTablesRaw = getEnv('SUPABASE_ALLOWED_TABLES'); // comma-separated; empty => all

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required env vars: SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_KEY).');
  process.exit(1);
}

let accessToken = getEnv('SUPABASE_ACCESS_TOKEN');

function getClient() {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return createClient(normalizeBaseUrl(supabaseUrl), supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers },
  });
}

const allowedTables =
  typeof allowedTablesRaw === 'string' && allowedTablesRaw.trim().length > 0
    ? new Set(
        allowedTablesRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      )
    : null; // null means allow all

function assertTableAllowed(table) {
  if (typeof table !== 'string' || table.trim().length === 0) {
    throw new Error('Missing "table" argument.');
  }
  if (allowedTables === null) return;
  if (allowedTables.has(table)) return;
  throw new Error(`Table "${table}" is not in SUPABASE_ALLOWED_TABLES allowlist.`);
}

let openApiCache = { atMs: 0, json: null };

async function fetchOpenApi() {
  const now = Date.now();
  if (openApiCache.json && now - openApiCache.atMs < 30_000) return openApiCache.json;

  const url = `${normalizeBaseUrl(supabaseUrl)}/rest/v1/`;
  const headers = {
    apikey: supabaseKey,
    Accept: 'application/openapi+json',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAPI fetch failed (${res.status}): ${text || res.statusText}`);
  }

  const json = await res.json();
  openApiCache = { atMs: now, json };
  return json;
}

function jsonText(value) {
  return JSON.stringify(value, null, 2);
}

const server = new Server(
  { name: 'supabase-mcp', version: '0.2.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'tables_list',
      description: 'List exposed tables/views via PostgREST OpenAPI.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'table_schema',
      description: 'Get a table/view schema via PostgREST OpenAPI.',
      inputSchema: {
        type: 'object',
        properties: { table: { type: 'string' } },
        required: ['table'],
      },
    },
    {
      name: 'query_database',
      description: 'Read/query a table/view (read-only by default).',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table or view name' },
          select: { type: 'string', description: 'Select columns, default "*"' },
          filters: { type: 'object', description: 'Equality filters (e.g. {"status":"active"})' },
          order: {
            type: 'object',
            description: 'Order: {column:"created_at", ascending:false}',
            properties: { column: { type: 'string' }, ascending: { type: 'boolean' } },
          },
          limit: { type: 'number', description: 'Limit rows' },
          count: { type: 'boolean', description: 'Include exact count (can be slow)' },
        },
        required: ['table'],
      },
    },
    {
      name: 'mutate_database',
      description: 'Insert/update/delete/upsert (disabled unless SUPABASE_ALLOW_MUTATIONS=true).',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          operation: { type: 'string', enum: ['insert', 'update', 'delete', 'upsert'] },
          data: { type: ['object', 'array'], description: 'Payload for insert/update/upsert' },
          filters: { type: 'object', description: 'Equality filters for update/delete' },
        },
        required: ['table', 'operation'],
      },
    },
    {
      name: 'auth_set_access_token',
      description: 'Set/replace a JWT access token (Authorization: Bearer ...) for RLS-scoped access.',
      inputSchema: {
        type: 'object',
        properties: { access_token: { type: 'string' } },
        required: ['access_token'],
      },
    },
    {
      name: 'storage_list_buckets',
      description: 'List Storage buckets.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'storage_list_files',
      description: 'List files in a Storage bucket path.',
      inputSchema: {
        type: 'object',
        properties: { bucket: { type: 'string' }, path: { type: 'string', default: '' }, limit: { type: 'number', default: 100 } },
        required: ['bucket'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'auth_set_access_token': {
        accessToken = args?.access_token;
        openApiCache = { atMs: 0, json: null };
        return { content: [{ type: 'text', text: jsonText({ success: true }) }] };
      }

      case 'tables_list': {
        const openapi = await fetchOpenApi();
        const paths = openapi?.paths && typeof openapi.paths === 'object' ? Object.keys(openapi.paths) : [];
        const tables = paths
          .filter((p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('/rpc/'))
          .map((p) => p.slice(1))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));

        const filtered = allowedTables === null ? tables : tables.filter((t) => allowedTables.has(t));
        return { content: [{ type: 'text', text: jsonText({ success: true, tables: filtered, count: filtered.length }) }] };
      }

      case 'table_schema': {
        const table = args?.table;
        assertTableAllowed(table);

        const openapi = await fetchOpenApi();
        const schema = openapi?.components?.schemas?.[table] ?? null;
        return { content: [{ type: 'text', text: jsonText({ success: true, table, schema }) }] };
      }

      case 'query_database': {
        const table = args?.table;
        assertTableAllowed(table);

        const client = getClient();
        const select = typeof args?.select === 'string' && args.select.trim().length > 0 ? args.select : '*';
        const wantCount = args?.count === true ? 'exact' : null;

        let query = client.from(table).select(select, { count: wantCount });

        if (args?.filters && typeof args.filters === 'object' && !Array.isArray(args.filters)) {
          for (const [key, value] of Object.entries(args.filters)) query = query.eq(key, value);
        }

        if (args?.order?.column) query = query.order(args.order.column, { ascending: args.order.ascending !== false });
        if (typeof args?.limit === 'number') query = query.limit(args.limit);

        const { data, error, count } = await query;
        if (error) throw error;
        return { content: [{ type: 'text', text: jsonText({ success: true, table, count, data }) }] };
      }

      case 'mutate_database': {
        if (!allowMutations) throw new Error('Mutations are disabled. Set SUPABASE_ALLOW_MUTATIONS=true to enable.');

        const table = args?.table;
        const operation = args?.operation;
        assertTableAllowed(table);

        const client = getClient();
        const payload = args?.data;
        const filters = args?.filters;

        let query;
        if (operation === 'insert') query = client.from(table).insert(payload).select();
        else if (operation === 'upsert') query = client.from(table).upsert(payload).select();
        else if (operation === 'update') {
          query = client.from(table).update(payload);
          if (filters && typeof filters === 'object' && !Array.isArray(filters)) {
            for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
          }
          query = query.select();
        } else if (operation === 'delete') {
          query = client.from(table).delete();
          if (filters && typeof filters === 'object' && !Array.isArray(filters)) {
            for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
          }
          query = query.select();
        } else {
          throw new Error(`Unsupported operation: ${operation}`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return { content: [{ type: 'text', text: jsonText({ success: true, table, operation, data }) }] };
      }

      case 'storage_list_buckets': {
        const client = getClient();
        const { data, error } = await client.storage.listBuckets();
        if (error) throw error;
        return { content: [{ type: 'text', text: jsonText({ success: true, buckets: data }) }] };
      }

      case 'storage_list_files': {
        const client = getClient();
        const bucket = args?.bucket;
        const path = typeof args?.path === 'string' ? args.path : '';
        const limit = typeof args?.limit === 'number' ? args.limit : 100;
        const { data, error } = await client.storage.from(bucket).list(path, { limit, offset: 0 });
        if (error) throw error;
        return { content: [{ type: 'text', text: jsonText({ success: true, bucket, path, files: data }) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: jsonText({ success: false, error: error?.message ?? String(error) }) }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();

  console.error('MCP Supabase server starting...');
  console.error(`SUPABASE_URL=${normalizeBaseUrl(supabaseUrl)}`);
  console.error(`Mutations: ${allowMutations ? 'ENABLED' : 'DISABLED (read-only)'}`);
  console.error(`Allowed tables: ${allowedTables === null ? 'ALL' : Array.from(allowedTables).join(', ')}`);

  await server.connect(transport);
  console.error('MCP Supabase server ready.');
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
