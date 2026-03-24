import { NextResponse } from 'next/server';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { getUserRole, requireAuth } from '@/lib/auth-guard';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function buildSystemPrompt(role: string) {
  const base = [
    'You are an intelligent ERP assistant for Graviton Production Hub.',
    'Keep answers concise and practical.',
    'Use plain text only (no Markdown).',
    'Do not reveal internal technical details (SQL, secrets, internal APIs).',
  ].join('\n');

  if (role === 'owner') {
    return [
      base,
      'User role: owner.',
      'Access scope: full (finance, production, marketing, HR, operations).',
      'Cross-functional recommendations are allowed.',
    ].join('\n');
  }

  return [
    base,
    `User role: ${role || 'restricted'}.`,
    'Full access is currently available only for owner.',
    'Do not provide restricted-domain data or recommendations.',
  ].join('\n');
}

function pickAssistantText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const obj = payload as Record<string, unknown>;
  const payloads = obj.payloads as Array<{ text?: string }> | undefined;
  if (Array.isArray(payloads) && typeof payloads[0]?.text === 'string') {
    return payloads[0].text.trim();
  }
  if (typeof obj.text === 'string') return obj.text.trim();
  if (typeof obj.reply === 'string') return obj.reply.trim();
  if (typeof obj.message === 'string') return obj.message.trim();
  return '';
}

async function runOpenRouterChat(systemPrompt: string, userText: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const primaryModel =
    process.env.OPENROUTER_MODEL ||
    process.env.SCOUT_OPENROUTER_MODEL ||
    'minimax/minimax-m2.5:free';
  const fallbackModels = String(process.env.OPENROUTER_FALLBACK_MODELS || 'openai/gpt-4o-mini,google/gemini-2.0-flash-001')
    .split(',')
    .map((item) => item.trim())
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
      if (!text) {
        lastError = `Empty response from model: ${model}`;
        continue;
      }

      if (/rate limit|too many requests|quota/i.test(text)) {
        lastError = `Rate limited on model: ${model}`;
        continue;
      }

      return text;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = `${model}: ${message}`;
    }
  }

  throw new Error(lastError);
}

function runOpenClawChat(systemPrompt: string, userText: string): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const rawModel =
    process.env.OPENCLAW_MODEL ||
    process.env.SCOUT_OPENCLAW_MODEL ||
    process.env.OPENROUTER_MODEL ||
    'minimax/minimax-m2.5:free';
  const model = rawModel.startsWith('openrouter/') ? rawModel : `openrouter/${rawModel}`;

  const stateDir = process.env.OPENCLAW_STATE_DIR || path.resolve(process.cwd(), '.openclaw');
  const configPath = process.env.OPENCLAW_CONFIG_PATH || path.join(stateDir, 'config.json');
  const fullMessage = `${systemPrompt}\n\nUser request:\n${userText}`;

  const env = {
    ...process.env,
    OPENROUTER_API_KEY: apiKey,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
  };

  const setModel = spawnSync(
    process.platform === 'win32' ? 'cmd.exe' : 'npx',
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npx', 'openclaw', 'models', 'set', model]
      : ['openclaw', 'models', 'set', model],
    {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: Number(process.env.SCOUT_CLI_TIMEOUT_MS || 20000),
      maxBuffer: 1024 * 1024,
    }
  );
  if (setModel.error) {
    throw new Error(`OpenClaw models set failed: ${setModel.error.message}`);
  }
  if (setModel.status !== 0) {
    throw new Error(setModel.stderr?.trim() || 'OpenClaw models set failed');
  }

  const agent = spawnSync(
    process.platform === 'win32' ? 'cmd.exe' : 'npx',
    process.platform === 'win32'
      ? [
          '/d',
          '/s',
          '/c',
          'npx',
          'openclaw',
          'agent',
          '--local',
          '--to',
          '+10000000000',
          '--message',
          fullMessage,
          '--thinking',
          'low',
          '--json',
          '--timeout',
          String(Number(process.env.SCOUT_AGENT_TIMEOUT_SEC || 120)),
        ]
      : [
          'openclaw',
          'agent',
          '--local',
          '--to',
          '+10000000000',
          '--message',
          fullMessage,
          '--thinking',
          'low',
          '--json',
          '--timeout',
          String(Number(process.env.SCOUT_AGENT_TIMEOUT_SEC || 120)),
        ],
    {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: Number(process.env.SCOUT_CLI_TIMEOUT_MS || 20000),
      maxBuffer: 1024 * 1024,
    }
  );
  if (agent.error) {
    throw new Error(`OpenClaw agent failed: ${agent.error.message}`);
  }
  if (agent.status !== 0) {
    throw new Error(agent.stderr?.trim() || 'OpenClaw agent failed');
  }

  const stdout = String(agent.stdout || '').trim();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = null;
  }

  const text = pickAssistantText(parsed) || stdout;
  return text.trim();
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const role = getUserRole(auth.user);

    const { messages } = (await req.json()) as { messages?: ChatMessage[] };
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages format' }, { status: 400 });
    }

    const lastMessage = String(messages[messages.length - 1]?.content || '');
    const provider = (process.env.SCOUT_AGENT_PROVIDER || 'openrouter-sdk').toLowerCase();
    const systemPrompt = buildSystemPrompt(role);

    let responseText = '';
    let providerUsed = provider;
    if (provider === 'openclaw-local') {
      try {
        responseText = runOpenClawChat(systemPrompt, lastMessage);
      } catch {
        responseText = await runOpenRouterChat(systemPrompt, lastMessage);
        providerUsed = 'openrouter-sdk:fallback';
      }
    } else {
      responseText = await runOpenRouterChat(systemPrompt, lastMessage);
    }

    return NextResponse.json({ content: responseText, role, provider: providerUsed });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json(
      {
        error: 'AI Assistant Error',
        message,
      },
      { status: 500 }
    );
  }
}
