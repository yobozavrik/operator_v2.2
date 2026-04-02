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

const SHARED_AGENT_RULES = [
  'Відповідай виключно українською мовою.',
  'Не використовуй російську чи англійську в тексті відповіді, окрім технічних назв, шляхів і ідентифікаторів.',
  'Можеш звертатися до Supabase лише у режимі читання: SELECT/read-запити дозволені, а insert/update/delete/upsert та будь-які зміни даних заборонені.',
  'Давай практичні, конкретні відповіді.',
].join('\n');

function buildSystemPrompt(lines: string[]): string {
  return [...lines, SHARED_AGENT_RULES].join('\n');
}

const AGENTS = {
  production: {
    name: 'Виробництво',
    systemPrompt: buildSystemPrompt([
      'Ти агент з виробництва для Graviton Production Hub.',
      'Твоя спеціалізація: виробництво піци, кондитерка, пекарня, планування Graviton hub.',
      'Теми: виробничі плани (D1/D2/D3), створення замовлень, синхронізація залишків, аналіз дефіциту, розподіл між магазинами.',
      'Ти знаєш, що в системі є розділи: /graviton, /pizza, /konditerka, /bakery, /bulvar, /florida, /sadova.',
    ]),
  },
  finance: {
    name: 'Фінанси',
    systemPrompt: buildSystemPrompt([
      'Ти фінансовий агент для Graviton Production Hub.',
      'Твоя спеціалізація: аналіз собівартості, прибутковість, витрати на постачання, фінансові метрики.',
      'Теми: цілі foodcost, собівартість інгредієнтів, виручка, маржа прибутку, фінансові цілі, підсумок для власника.',
      'Ти знаєш, що в системі є розділи: /foodcost, /finance, панель власника.',
    ]),
  },
  hr: {
    name: 'Кадри',
    systemPrompt: buildSystemPrompt([
      'Ти HR-агент для Graviton Production Hub.',
      'Твоя спеціалізація: графіки змін, керування персоналом, облікові записи працівників.',
      'Теми: плани змін, доступність персоналу, робочі години, призначення працівників за підрозділами.',
      'Ти знаєш, що в системі є розділ /hr з можливостями планування змін.',
    ]),
  },
  analytics: {
    name: 'Аналітика',
    systemPrompt: buildSystemPrompt([
      'Ти агент з аналітики для Graviton Production Hub.',
      'Твоя спеціалізація: аналітика продажів, прогнозування, тренди, 180-денна історія виробництва, BI-дашборди.',
      'Теми: ефективність продуктів, прогноз попиту, тренди продажів, кросфункціональна аналітика.',
      'Ти знаєш, що в системі є розділи: /analytics, /bi, /forecasting.',
    ]),
  },
  supply: {
    name: 'Постачання',
    systemPrompt: buildSystemPrompt([
      'Ти агент з постачання для Graviton Production Hub.',
      'Твоя спеціалізація: постачання інгредієнтів, складські залишки, накладні, дефіцит сировини.',
      'Теми: накладні постачання, рівень запасів, доступність сировини, керування ланцюгом постачання.',
      'Ти знаєш, що керування постачанням є в /foodcost/supply і модулі supply-chief.',
    ]),
  },
} as const;

type AgentKey = keyof typeof AGENTS;

// ─── Router prompt ────────────────────────────────────────────────────────────

const ROUTER_SYSTEM = `Ти маршрутизатор запитів для ERP-системи харчового виробництва.
Класифікуй запит користувача в один або кілька з таких доменів:
- production: виробництво, плани, дефіцит, розподіл, замовлення, піца, кондитерка, пекарня
- finance: фінанси, собівартість, прибуток, витрати, foodcost, виручка, бюджет
- hr: кадри, персонал, зміни, співробітники, графік, штат
- analytics: аналітика, прогноз, тренд, статистика, звіт, динаміка
- supply: постачання, сировина, накладні, склад, запаси, постачальники

Відповідай ЛИШЕ JSON-масивом відповідних доменів, наприклад: ["production"] або ["finance","analytics"].
Якщо незрозуміло, використовуй ["production"] за замовчуванням.`;

// ─── OpenRouter SDK call ──────────────────────────────────────────────────────

async function callOpenRouter(systemPrompt: string, userText: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY не налаштовано');

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

  let lastError = 'Помилка запиту OpenRouter';
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
      if (!text) { lastError = `Порожня відповідь від ${model}`; continue; }
      if (/rate limit|too many requests|quota/i.test(text)) { lastError = `Перевищено ліміт запитів на ${model}`; continue; }
      return text;
    } catch {
      lastError = `Помилка моделі ${model}`;
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
  if (!apiKey) throw new Error('OPENROUTER_API_KEY не налаштовано');

  const rawModel =
    process.env.OPENCLAW_MODEL ||
    process.env.SCOUT_OPENCLAW_MODEL ||
    process.env.OPENROUTER_MODEL ||
    'minimax/minimax-m2.5:free';
  const model = rawModel.startsWith('openrouter/') ? rawModel : `openrouter/${rawModel}`;
  const stateDir = process.env.OPENCLAW_STATE_DIR || path.resolve(process.cwd(), '.openclaw');
  const configPath = process.env.OPENCLAW_CONFIG_PATH || path.join(stateDir, 'config.json');
  const fullMessage = `${systemPrompt}\n\nЗапит користувача:\n${userText}`;
  const env = { ...process.env, OPENROUTER_API_KEY: apiKey, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_CONFIG_PATH: configPath };
  const isWin = process.platform === 'win32';
  const timeout = Number(process.env.SCOUT_CLI_TIMEOUT_MS || 20000);

  const setModel = spawnSync(
    isWin ? 'cmd.exe' : 'npx',
    isWin ? ['/d', '/s', '/c', 'npx', 'openclaw', 'models', 'set', model] : ['openclaw', 'models', 'set', model],
    { cwd: process.cwd(), env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout, maxBuffer: 1024 * 1024 }
  );
  if (setModel.error) throw new Error('Не вдалося встановити модель OpenClaw');
  if (setModel.status !== 0) throw new Error('Не вдалося встановити модель OpenClaw');

  const agentTimeout = String(Number(process.env.SCOUT_AGENT_TIMEOUT_SEC || 120));
  const agent = spawnSync(
    isWin ? 'cmd.exe' : 'npx',
    isWin
      ? ['/d', '/s', '/c', 'npx', 'openclaw', 'agent', '--local', '--to', '+10000000000', '--message', fullMessage, '--thinking', 'low', '--json', '--timeout', agentTimeout]
      : ['openclaw', 'agent', '--local', '--to', '+10000000000', '--message', fullMessage, '--thinking', 'low', '--json', '--timeout', agentTimeout],
    { cwd: process.cwd(), env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout, maxBuffer: 1024 * 1024 }
  );
  if (agent.error) throw new Error('Не вдалося запустити OpenClaw agent');
  if (agent.status !== 0) throw new Error('Не вдалося запустити OpenClaw agent');

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
    'Ти Оркестратор для Graviton Production Hub.',
    'Нижче наведені відповіді спеціалізованих агентів. Об\'єднай їх в одну цілісну структуровану відповідь.',
    'Збережи всі важливі деталі. Використовуй зрозумілі розділи, якщо це допоможе.',
    'Відповідай виключно українською мовою.',
    'Не використовуй російську чи англійську в тексті відповіді, окрім технічних назв, шляхів і ідентифікаторів.',
    'Не згадуй "агентів" — подай відповідь як єдиний текст.',
    'Можеш звертатися до Supabase лише у режимі читання: SELECT/read-запити дозволені, будь-які зміни даних заборонені.',
  ].join('\n');

  const finalAnswer = await callLLM(synthesisPrompt, `Запит користувача: ${userText}\n\n${combinedInput}`);

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
      return NextResponse.json({ error: 'Некоректний формат повідомлень' }, { status: 400 });
    }
    if (messages.length > 50) {
      return NextResponse.json({ error: 'Забагато повідомлень, максимум 50' }, { status: 400 });
    }

    const lastMessage = String(messages[messages.length - 1]?.content || '').slice(0, 5000);
    const { content, agents } = await orchestrate(lastMessage, role);

    return NextResponse.json({ content, role, agents });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Внутрішня помилка';
    return NextResponse.json({ error: 'Помилка AI-асистента', message }, { status: 500 });
  }
}
