#!/usr/bin/env node

/**
 * Instagram Scout Agent
 *
 * Modes:
 * 1) mock (default)
 * 2) live + provider=openclaw-local (OpenClaw CLI with OpenRouter)
 * 3) live + provider=openrouter-sdk (direct OpenRouter SDK)
 * 4) live + provider=<any> using SCOUT_AGENT_ENDPOINT (HTTP adapter)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function safeJson(input, fallback) {
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}

function dayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function toIso(date = new Date()) {
  return date.toISOString();
}

function looksLikeUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function inferHandleFromUrl(url) {
  if (!looksLikeUrl(url)) return '';
  const match = String(url).match(/instagram\.com\/([a-zA-Z0-9._-]+)/i);
  return match?.[1] ? match[1].toLowerCase() : '';
}

function inferHandleFromText(text, seeds) {
  const raw = String(text || '');
  const handles = raw.match(/@[a-zA-Z0-9._-]+/g) || [];
  if (handles.length > 0) return handles[0].replace('@', '').toLowerCase();

  const lowered = raw.toLowerCase();
  const seedHit = seeds.find((seed) => lowered.includes(String(seed).toLowerCase()));
  return seedHit ? String(seedHit).toLowerCase() : '';
}


function normalizeEventTime(value, lookbackHours = 24) {
  const now = new Date();
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return now.toISOString();
  }

  const min = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
  const max = new Date(now.getTime() + 5 * 60 * 1000);
  if (parsed < min || parsed > max) {
    return now.toISOString();
  }
  return parsed.toISOString();
}
function hashEvent(event) {
  const raw = `${event.source}|${event.competitor_handle}|${event.post_url}|${event.posted_at}|${event.text}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return `evt_${Math.abs(hash)}`;
}

function buildDefaultSeeds() {
  return ['galyabaluvana_official', 'bakery_city_1', 'bakery_city_2'];
}

function buildDefaultKeywords() {
  return ['hlib', 'baget', 'akciya', 'znyzhka', 'novinka', 'vypichka'];
}

function makeMockEvents({ seeds }) {
  const now = new Date();
  const samples = [
    'Akciya -20% na baget francuz do kincya tyzhnya',
    'Nova poziciya: hlib z nasinnyam lonu',
    'Rankova znyzhka na hlib do 12:00',
    'Zapusk novogo hliba tartin',
    'Kombo-propoziciya: 2 hliba za specialnoyu cinoyu',
  ];

  const events = [];
  for (const handle of seeds) {
    for (let i = 0; i < 3; i += 1) {
      const text = samples[Math.floor(Math.random() * samples.length)];
      const posted = new Date(now.getTime() - (i + 1) * 60 * 60 * 1000);
      events.push({
        source: 'instagram',
        competitor_handle: handle,
        post_url: `https://instagram.com/${handle}/p/mock${i + 1}`,
        posted_at: posted.toISOString(),
        text,
        media_type: 'image',
        confidence: 0.9,
      });
    }
  }
  return events;
}

function runCmd(bin, args, env) {
  const res = spawnSync(bin, args, {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: res.status,
    stdout: String(res.stdout || '').trim(),
    stderr: String(res.stderr || '').trim(),
  };
}

function extractJsonText(input) {
  const text = String(input || '').trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) return fenced[1].trim();

  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    return text.slice(arrStart, arrEnd + 1);
  }

  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    return text.slice(objStart, objEnd + 1);
  }

  return null;
}

function pickAgentText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = [
    payload.reply,
    payload.replyText,
    payload.text,
    payload.output,
    payload.message,
    payload.result?.text,
    payload.result?.reply,
    payload.data?.text,
    payload.payloads?.[0]?.text,
  ];
  const winner = candidates.find((x) => typeof x === 'string' && x.trim().length > 0);
  if (winner) return winner;
  return JSON.stringify(payload);
}

function sanitizeAndValidateRawEvents(input, seeds) {
  const candidates = Array.isArray(input)
    ? input
    : Array.isArray(input?.events)
      ? input.events
      : [];

  const sanitized = [];
  const lookbackHours = Number(process.env.SCOUT_LOOKBACK_HOURS || 24);
  for (const item of candidates) {
    const sourceUrl = item.post_url || item.source_url || item.url || null;
    const text = String(item.text || item.title || item.summary || '').trim();
    const competitor = String(
      item.competitor_handle ||
        item.competitor ||
        item.competitor_name ||
        inferHandleFromUrl(sourceUrl) ||
        inferHandleFromText(text, seeds) ||
        ''
    )
      .trim()
      .replace(/^@+/, '')
      .toLowerCase();

    const postedAtRaw = String(item.posted_at || item.event_time || item.event_date || '').trim();
    const confidenceRaw = Number(item.confidence ?? item.confidence_score ?? 0.7);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : 0.7;

    if (!competitor || !looksLikeUrl(sourceUrl) || text.length < 8) {
      continue;
    }

    sanitized.push({
      source: String(item.source || 'instagram').trim().toLowerCase(),
      competitor_handle: competitor,
      post_url: sourceUrl,
      posted_at: normalizeEventTime(postedAtRaw, lookbackHours),
      text,
      confidence,
    });
  }

  return sanitized;
}

async function callOpenClawCollector({ seeds, keywords }) {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    throw new Error('OPENROUTER_API_KEY is required for provider=openclaw-local');
  }

  const explicitOpenClawModel = process.env.OPENCLAW_MODEL || process.env.SCOUT_OPENCLAW_MODEL;
  const openRouterModel = process.env.OPENROUTER_MODEL || process.env.SCOUT_OPENROUTER_MODEL;
  const model = explicitOpenClawModel
    ? explicitOpenClawModel
    : openRouterModel
      ? `openrouter/${String(openRouterModel).replace(/^openrouter\//, '')}`
      : 'openrouter/meta-llama/llama-3.3-70b-instruct:free';

  const lookbackHours = Number(process.env.SCOUT_LOOKBACK_HOURS || 24);
  const stateDir = process.env.OPENCLAW_STATE_DIR || path.resolve(process.cwd(), '.openclaw');
  const configPath = process.env.OPENCLAW_CONFIG_PATH || path.join(stateDir, 'config.json');
  const isWin = process.platform === 'win32';
  const npxBin = isWin ? 'cmd.exe' : 'npx';
  const withNpx = (args) => (isWin ? ['/d', '/s', '/c', 'npx', ...args] : args);

  fs.mkdirSync(stateDir, { recursive: true });

  const env = {
    ...process.env,
    OPENROUTER_API_KEY: openRouterKey,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
  };

  const authProfilesPath = path.join(stateDir, 'agents', 'main', 'agent', 'auth-profiles.json');
  if (!fs.existsSync(authProfilesPath)) {
    const onboard = runCmd(
      npxBin,
      withNpx([
        'openclaw',
        'onboard',
        '--non-interactive',
        '--accept-risk',
        '--mode',
        'local',
        '--auth-choice',
        'openrouter-api-key',
        '--openrouter-api-key',
        openRouterKey,
        '--skip-channels',
        '--skip-skills',
        '--skip-ui',
        '--skip-health',
        '--skip-daemon',
      ]),
      env
    );
    if (onboard.status !== 0) {
      throw new Error(`OpenClaw onboard failed: ${onboard.stderr || onboard.stdout}`);
    }
  }

  const setModel = runCmd(npxBin, withNpx(['openclaw', 'models', 'set', model]), env);
  if (setModel.status !== 0) {
    throw new Error(`OpenClaw models set failed: ${setModel.stderr || setModel.stdout}`);
  }

  const prompt = [
    'You are market intelligence parser for bakery competition.',
    `Lookback window: ${lookbackHours} hours.`,
    `Competitor seeds: ${seeds.join(', ')}`,
    `Keywords: ${keywords.join(', ')}`,
    'Return ONLY valid JSON array.',
    'Each item MUST contain:',
    '{"source":"instagram","competitor_handle":"string","post_url":"https://...","posted_at":"ISO","text":"...","confidence":0.0}',
    'Generate 8-15 realistic events. No markdown. No explanation.',
  ].join('\n');

  const agent = runCmd(
    npxBin,
    withNpx([
      'openclaw',
      'agent',
      '--local',
      '--to',
      '+10000000000',
      '--message',
      prompt,
      '--thinking',
      'low',
      '--json',
      '--timeout',
      String(Number(process.env.SCOUT_AGENT_TIMEOUT_SEC || 180)),
    ]),
    env
  );

  if (agent.status !== 0) {
    throw new Error(`OpenClaw agent failed: ${agent.stderr || agent.stdout}`);
  }

  const payload = safeJson(agent.stdout, null);
  const replyText = pickAgentText(payload) || agent.stdout;
  const extracted = extractJsonText(replyText);
  const parsed = extracted ? safeJson(extracted, null) : null;

  if (!parsed) {
    const providerMessage = String(payload?.payloads?.[0]?.text || '').trim();
    if (providerMessage && /rate limit/i.test(providerMessage)) {
      throw new Error(`OpenClaw provider rate-limited: ${providerMessage}`);
    }
    if (/rate limit/i.test(replyText)) {
      throw new Error(`OpenClaw provider rate-limited: ${replyText}`);
    }
    throw new Error('OpenClaw response parsing failed');
  }

  const sanitized = sanitizeAndValidateRawEvents(parsed, seeds);
  if (sanitized.length === 0) {
    throw new Error('OpenClaw returned events, but none passed validation (missing competitor/url/text)');
  }

  return sanitized;
}

async function callHttpCollector({ seeds, keywords, provider }) {
  const endpoint = process.env.SCOUT_AGENT_ENDPOINT;
  const apiKey = process.env.SCOUT_AGENT_API_KEY;

  if (!endpoint) {
    throw new Error('SCOUT_AGENT_ENDPOINT is required for live HTTP provider');
  }

  const body = {
    provider,
    task: 'collect_instagram_daily_activity',
    seeds,
    keywords,
    lookback_hours: Number(process.env.SCOUT_LOOKBACK_HOURS || 24),
    locale: 'uk-UA',
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Live collector failed: ${response.status} ${text}`);
  }

  const payload = await response.json();
  const sanitized = sanitizeAndValidateRawEvents(payload, seeds);
  if (sanitized.length === 0) {
    throw new Error('HTTP provider returned no valid events (missing competitor/url/text)');
  }
  return sanitized;
}

async function callOpenRouterCollector({ seeds, keywords }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required for provider=openrouter-sdk');
  }

  const model = process.env.OPENROUTER_MODEL || process.env.SCOUT_OPENROUTER_MODEL || 'openai/gpt-4o-mini';

  const { OpenRouter } = await import('@openrouter/sdk');
  const client = new OpenRouter({ apiKey });

  const prompt = [
    'Return ONLY valid JSON array.',
    'Task: create instagram competitor events for bakery market intelligence.',
    `Seeds: ${seeds.join(', ')}`,
    `Keywords: ${keywords.join(', ')}`,
    'Each item MUST contain fields:',
    '{"source":"instagram","competitor_handle":"string","post_url":"https://...","posted_at":"ISO","text":"...","confidence":0.0}',
    'You may also include aliases: competitor_name, title, source_url (they will be mapped).',
    'Generate 8-12 realistic events from last 24 hours.',
    'No markdown, no comments, no extra text.',
    'post_url/source_url must be full URL, competitor_handle without "@".',
  ].join('\n');

  const providerOrder = (process.env.OPENROUTER_PROVIDER_ORDER || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const chatGenerationParams = {
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  };

  if (providerOrder.length > 0) {
    chatGenerationParams.provider = { order: providerOrder };
  }

  const response = await client.chat.send({ chatGenerationParams });

  const text = String(response?.choices?.[0]?.message?.content || '').trim();
  const extracted = extractJsonText(text);
  const parsed = extracted ? safeJson(extracted, null) : null;

  if (!parsed) {
    throw new Error('OpenRouter response parsing failed');
  }

  const sanitized = sanitizeAndValidateRawEvents(parsed, seeds);
  if (sanitized.length === 0) {
    throw new Error('OpenRouter returned events, but none passed validation (missing competitor/url/text)');
  }

  return sanitized;
}

async function callLiveCollector({ seeds, keywords }) {
  const provider = (process.env.SCOUT_AGENT_PROVIDER || 'openclaw').toLowerCase();

  if (provider === 'openclaw-local') {
    return callOpenClawCollector({ seeds, keywords });
  }

  if (provider === 'openrouter-sdk') {
    return callOpenRouterCollector({ seeds, keywords });
  }

  return callHttpCollector({ seeds, keywords, provider });
}

function normalizeEvent(raw) {
  const text = String(raw.text || '').trim();
  const lowered = text.toLowerCase();
  const hasAny = (parts) => parts.some((part) => lowered.includes(part));

  let eventType = 'content_campaign';
  if (hasAny(['promo', 'promotion', 'discount', 'sale', 'Р°РєС†С–СЏ', 'СЃРєРёРґРєР°', 'akci', 'znyzhk'])) {
    eventType = 'promotion';
  } else if (hasAny(['new sku', 'launch', 'РЅРѕРІРёРЅРєР°', 'РЅРѕРІР° РїРѕР·РёС†С–СЏ', 'nova', 'novinka'])) {
    eventType = 'new_sku';
  } else if (hasAny(['price', 'С†С–РЅР°', 'cina', 'РіСЂРЅ', 'uah'])) {
    eventType = 'price_change';
  }

  let severity = 'medium';
  if (lowered.includes('-30%') || lowered.includes('-40%')) severity = 'high';
  if (eventType === 'content_campaign') severity = 'low';

  return {
    source: raw.source || 'instagram',
    competitor_handle: String(raw.competitor_handle || '').trim().toLowerCase(),
    post_url: raw.post_url || null,
    posted_at: raw.posted_at || toIso(),
    text,
    event_type: eventType,
    severity,
    confidence: Number(raw.confidence ?? 0.72),
    event_hash: hashEvent(raw),
  };
}

function discoverCompetitors(events, seeds) {
  const seedSet = new Set(seeds.map((s) => s.toLowerCase()));
  const discovered = new Map();

  for (const ev of events) {
    const text = ev.text || '';
    const handles = text.match(/@[a-zA-Z0-9._]+/g) || [];
    for (const h of handles) {
      const handle = h.replace('@', '').toLowerCase();
      if (seedSet.has(handle)) continue;
      if (!discovered.has(handle)) {
        discovered.set(handle, {
          handle,
          reason: 'mentioned_in_competitor_post',
          first_seen_at: toIso(),
          priority: 'medium',
        });
      }
    }
  }

  return Array.from(discovered.values());
}

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function writeToDb(supabase, normalizedEvents, discovered) {
  if (!supabase) return { db: 'skipped' };

  for (const comp of discovered) {
    await supabase.schema('market_intel').from('competitors').upsert(
      {
        handle: comp.handle,
        name: comp.handle,
        priority: comp.priority,
        source: 'instagram_discovery',
        status: 'pending_review',
      },
      { onConflict: 'handle' }
    );
  }

  const rows = normalizedEvents.map((ev) => ({
    source: ev.source,
    competitor_handle: ev.competitor_handle,
    event_time: ev.posted_at,
    payload_json: {
      text: ev.text,
      post_url: ev.post_url,
      confidence: ev.confidence,
    },
    event_hash: ev.event_hash,
  }));

  if (rows.length) {
    await supabase.schema('market_intel').from('raw_events').upsert(rows, { onConflict: 'event_hash' });
  }

  const normalizedRows = normalizedEvents.map((ev) => ({
    event_hash: ev.event_hash,
    event_type: ev.event_type,
    severity: ev.severity,
    confidence: ev.confidence,
    summary_uk: ev.text.slice(0, 500),
    source_url: ev.post_url,
    event_date: ev.posted_at.slice(0, 10),
  }));

  if (normalizedRows.length) {
    await supabase.schema('market_intel').from('normalized_events').upsert(normalizedRows, { onConflict: 'event_hash' });
  }

  return { db: 'ok', inserted_raw: rows.length, inserted_normalized: normalizedRows.length };
}

async function main() {
  loadEnv();

  const cliLive = process.argv.includes('--live');
  const mode = (cliLive ? 'live' : process.env.SCOUT_MODE || 'mock').toLowerCase();
  const seeds = safeJson(process.env.SCOUT_COMPETITOR_SEEDS || '', buildDefaultSeeds());
  const keywords = safeJson(process.env.SCOUT_KEYWORDS || '', buildDefaultKeywords());

  const rawEvents = mode === 'live' ? await callLiveCollector({ seeds, keywords }) : makeMockEvents({ seeds, keywords });

  const normalizedEvents = rawEvents.map(normalizeEvent);
  const discovered = discoverCompetitors(normalizedEvents, seeds);

  const report = {
    date: dayStamp(),
    mode,
    provider: process.env.SCOUT_AGENT_PROVIDER || 'mock',
    collected_events: rawEvents.length,
    normalized_events: normalizedEvents.length,
    discovered_competitors: discovered.length,
    top_event_types: normalizedEvents.reduce((acc, ev) => {
      acc[ev.event_type] = (acc[ev.event_type] || 0) + 1;
      return acc;
    }, {}),
    events_preview: normalizedEvents.slice(0, 10),
    discovered_preview: discovered.slice(0, 10),
  };

  const outDir = path.resolve(process.cwd(), 'tmp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, `scout_${dayStamp()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  let dbResult = { db: 'skipped' };
  try {
    const supabase = createSupabaseClient();
    dbResult = await writeToDb(supabase, normalizedEvents, discovered);
  } catch (error) {
    dbResult = { db: 'failed', error: error.message };
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode,
        provider: report.provider,
        report_path: reportPath,
        ...dbResult,
        collected_events: rawEvents.length,
        discovered_competitors: discovered.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
