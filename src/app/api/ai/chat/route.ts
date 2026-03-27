import { NextResponse } from 'next/server';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { getUserRole, requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

// ─── Agent definitions ───────────────────────────────────────────────────────

const AGENTS = {
  production: {
    name: 'Виробництво',
    systemPrompt: [
      'You are the Production Agent for Graviton Production Hub.',
      'You specialize in: pizza production, konditerka (confectionery), bakery, Graviton hub planning.',
      'Topics: production plans (D1/D2/D3), order creation, stock sync, deficit analysis, shop distribution.',
      'You know the system has sections: /graviton, /pizza, /konditerka, /bakery, /bulvar, /florida, /sadova.',
      'Give practical, specific answers. Answer in Ukrainian.',
    ].join('\n'),
  },
  finance: {
    name: 'Фінанси',
    systemPrompt: [
      'You are the Finance Agent for Graviton Production Hub.',
      'You specialize in: food cost analysis, profitability, supply costs, financial metrics.',
      'Topics: food cost targets, ingredient costs, revenue, profit margins, financial goals, owner summary.',
      'You know the system has sections: /foodcost, /finance, /owner dashboard.',
      'Give practical, specific answers. Answer in Ukrainian.',
    ].join('\n'),
  },
  hr: {
    name: 'Кадри',
    systemPrompt: [
      'You are the HR Agent for Graviton Production Hub.',
      'You specialize in: shift scheduling, staff management, employee records.',
      'Topics: shift plans, staff availability, working hours, employee assignments by department.',
      'You know the system has an /hr section with shift scheduling capabilities.',
      'Give practical, specific answers. Answer in Ukrainian.',
    ].join('\n'),
  },
  analytics: {
    name: 'Аналітика',
    systemPrompt: [
      'You are the Analytics Agent for Graviton Production Hub.',
      'You specialize in: sales analytics, forecasting, trends, 180-day production history, BI dashboards.',
      'Topics: product performance, demand forecasting, sales trends, cross-department analytics.',
      'You know the system has sections: /analytics, /bi, /forecasting.',
      'Give practical, specific answers. Answer in Ukrainian.',
    ].join('\n'),
  },
  supply: {
    name: 'Постачання',
    systemPrompt: [
      'You are the Supply Agent for Graviton Production Hub.',
      'You specialize in: ingredient supply, warehouse stock, invoices, raw material deficits.',
      'Topics: supply invoices, stock levels, raw material availability, supply chain management.',
      'You know the system has supply management in /foodcost/supply and supply-chief module.',
      'Give practical, specific answers. Answer in Ukrainian.',
    ].join('\n'),
  },
} as const;

type AgentKey = keyof typeof AGENTS;

// ─── Router prompt ────────────────────────────────────────────────────────────

const ROUTER_SYSTEM = `You are a query router for a food production ERP system.
Classify the user query into one or more of these agent domains:
- production: виробництво, плани, дефіцит, розподіл, замовлення, піца, кондитерка, пекарня
- finance: фінанси, собівартість, прибуток, витрати, foodcost, виручка, бюджет
- hr: кадри, персонал, зміни, співробітники, графік, штат
- analytics: аналітика, прогноз, тренд, статистика, звіт, динаміка
- supply: постачання, сировина, накладні, склад, запаси, постачальники

Respond ONLY with a JSON array of matching domains, e.g.: ["production"] or ["finance","analytics"]
If unclear, use ["production"] as default.`;

// ─── OpenRouter SDK call ──────────────────────────────────────────────────────

async function callOpenRouter(systemPrompt: string, userText: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  const primaryModel =
    process.env.OPENROUTER_MODEL ||
    process.env.SCOUT_OPENROUTER_MODEL ||
    'minimax/minimax-m2.5:free';
  const fallbackModels = String(
    process.env.OPENROUTER_FALLBACK_MODELS || 'openai/gpt-4o-mini,google/gemini-2.0-flash-001'
  )
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const models = [primaryModel, ...fallbackModels.filter((m) => m !== primaryModel)];

  const { OpenRouter } = await import('@openrouter/sdk');
  const client = new OpenRouter({ apiKey });

  let lastError = 'OpenRouter request failed';
  for (const model of models) {
    try {
      const response = await client.chat.send({
        chatGenerationParams: {
          model,
          stream: false,
          temperature: 0.2,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ],
        },
      });
      const text = String(response?.choices?.[0]?.message?.content || '').trim();
      if (!text) { lastError = `Empty response from ${model}`; continue; }
      if (/rate limit|too many requests|quota/i.test(text)) { lastError = `Rate limited on ${model}`; continue; }
      return text;
    } catch (err: unknown) {
      lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  throw new Error(lastError);
}

// ─── OpenClaw fallback ────────────────────────────────────────────────────────

function pickAssistantText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const obj = payload as Record<string, unknown>;
  const payloads = obj.payloads as Array<{ text?: string }> | undefined;
  if (Array.isArray(payloads) && typeof payloads[0]?.text === 'string') return payloads[0].text.trim();
  if (typeof obj.text === 'string') return obj.text.trim();
  if (typeof obj.reply === 'string') return obj.reply.trim();
  if (typeof obj.message === 'string') return obj.message.trim();
  return '';
}

function runOpenClawChat(systemPrompt: string, userText: string): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  const rawModel =
    process.env.OPENCLAW_MODEL ||
    process.env.SCOUT_OPENCLAW_MODEL ||
    process.env.OPENROUTER_MODEL ||
    'minimax/minimax-m2.5:free';
  const model = rawModel.startsWith('openrouter/') ? rawModel : `openrouter/${rawModel}`;
  const stateDir = process.env.OPENCLAW_STATE_DIR || path.resolve(process.cwd(), '.openclaw');
  const configPath = process.env.OPENCLAW_CONFIG_PATH || path.join(stateDir, 'config.json');
  const fullMessage = `${systemPrompt}\n\nUser request:\n${userText}`;
  const env = { ...process.env, OPENROUTER_API_KEY: apiKey, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_CONFIG_PATH: configPath };
  const isWin = process.platform === 'win32';
  const timeout = Number(process.env.SCOUT_CLI_TIMEOUT_MS || 20000);

  const setModel = spawnSync(
    isWin ? 'cmd.exe' : 'npx',
    isWin ? ['/d', '/s', '/c', 'npx', 'openclaw', 'models', 'set', model] : ['openclaw', 'models', 'set', model],
    { cwd: process.cwd(), env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout, maxBuffer: 1024 * 1024 }
  );
  if (setModel.error) throw new Error(`OpenClaw models set failed: ${setModel.error.message}`);
  if (setModel.status !== 0) throw new Error(setModel.stderr?.trim() || 'OpenClaw models set failed');

  const agentTimeout = String(Number(process.env.SCOUT_AGENT_TIMEOUT_SEC || 120));
  const agent = spawnSync(
    isWin ? 'cmd.exe' : 'npx',
    isWin
      ? ['/d', '/s', '/c', 'npx', 'openclaw', 'agent', '--local', '--to', '+10000000000', '--message', fullMessage, '--thinking', 'low', '--json', '--timeout', agentTimeout]
      : ['openclaw', 'agent', '--local', '--to', '+10000000000', '--message', fullMessage, '--thinking', 'low', '--json', '--timeout', agentTimeout],
    { cwd: process.cwd(), env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout, maxBuffer: 1024 * 1024 }
  );
  if (agent.error) throw new Error(`OpenClaw agent failed: ${agent.error.message}`);
  if (agent.status !== 0) throw new Error(agent.stderr?.trim() || 'OpenClaw agent failed');

  const stdout = String(agent.stdout || '').trim();
  let parsed: unknown = null;
  try { parsed = JSON.parse(stdout); } catch { parsed = null; }
  return (pickAssistantText(parsed) || stdout).trim();
}

// ─── LLM dispatch (OpenRouter or OpenClaw) ────────────────────────────────────

async function callLLM(systemPrompt: string, userText: string): Promise<string> {
  const provider = (process.env.SCOUT_AGENT_PROVIDER || 'openrouter-sdk').toLowerCase();
  if (provider === 'openclaw-local') {
    try {
      return runOpenClawChat(systemPrompt, userText);
    } catch {
      return callOpenRouter(systemPrompt, userText);
    }
  }
  return callOpenRouter(systemPrompt, userText);
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

async function routeQuery(userText: string): Promise<AgentKey[]> {
  try {
    const raw = await callLLM(ROUTER_SYSTEM, userText);
    const match = raw.match(/\[.*?\]/s);
    if (!match) return ['production'];
    const parsed = JSON.parse(match[0]) as string[];
    const valid = parsed.filter((k): k is AgentKey => k in AGENTS);
    return valid.length > 0 ? valid : ['production'];
  } catch {
    return ['production'];
  }
}

async function runAgent(agentKey: AgentKey, userText: string, userRole: string): Promise<string> {
  const agent = AGENTS[agentKey];
  const roleNote = userRole === 'owner'
    ? 'User is the owner — full access to all data.'
    : `User role: ${userRole || 'restricted'}.`;

  const systemPrompt = `${agent.systemPrompt}\n${roleNote}`;
  return callLLM(systemPrompt, userText);
}

async function orchestrate(userText: string, userRole: string): Promise<{ content: string; agents: string[] }> {
  // Step 1: route
  const agentKeys = await routeQuery(userText);

  // Step 2: run agents in parallel
  const results = await Promise.all(
    agentKeys.map(async (key) => {
      const answer = await runAgent(key, userText, userRole);
      return { key, name: AGENTS[key].name, answer };
    })
  );

  // Step 3: if single agent — return directly
  if (results.length === 1) {
    return {
      content: results[0].answer,
      agents: [results[0].name],
    };
  }

  // Step 4: synthesize multi-agent answers
  const combinedInput = results
    .map((r) => `=== Агент: ${r.name} ===\n${r.answer}`)
    .join('\n\n');

  const synthesisPrompt = [
    'You are the Orchestrator for Graviton Production Hub.',
    'Below are answers from specialized agents. Combine them into one coherent, structured response.',
    'Preserve all important details. Use clear sections if helpful. Answer in Ukrainian.',
    'Do not mention "agents" — present as one unified answer.',
  ].join('\n');

  const finalAnswer = await callLLM(synthesisPrompt, `User question: ${userText}\n\n${combinedInput}`);

  return {
    content: finalAnswer,
    agents: results.map((r) => r.name),
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const role = getUserRole(auth.user);

    const { messages } = (await req.json()) as { messages?: ChatMessage[] };
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages format' }, { status: 400 });
    }
    if (messages.length > 50) {
      return NextResponse.json({ error: 'Too many messages, maximum 50 allowed' }, { status: 400 });
    }

    const lastMessage = String(messages[messages.length - 1]?.content || '').slice(0, 5000);
    const { content, agents } = await orchestrate(lastMessage, role);

    return NextResponse.json({ content, role, agents });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ error: 'AI Assistant Error', message }, { status: 500 });
  }
}
