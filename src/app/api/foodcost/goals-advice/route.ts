import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import type { FoodCostSummary, CategoryMetrics, ProductMetrics } from '@/app/api/foodcost/route';

export const dynamic = 'force-dynamic';

async function callGemini(prompt: string): Promise<string> {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not configured');

    const systemInstruction = [
        'Ти аналітик фудкосту в пекарні/кулінарії в Україні.',
        'Відповідай тільки українською мовою.',
        'Відповідь — суворо JSON без коментарів і без markdown-блоку ```json.',
        'Давай конкретні, дієві рекомендації з назвами позицій та цифрами.',
    ].join(' ');

    const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];

    let lastError = 'All Gemini models failed';
    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemInstruction }] },
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.35,
                        maxOutputTokens: 1200,
                        responseMimeType: 'application/json',
                    },
                }),
            });

            if (!res.ok) {
                const err = await res.text();
                lastError = `${model}: HTTP ${res.status} — ${err.slice(0, 200)}`;
                continue;
            }

            const data = await res.json() as {
                candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            };
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            if (text) return text;
            lastError = `Empty response from ${model}`;
        } catch (e: unknown) {
            lastError = `${model}: ${e instanceof Error ? e.message : String(e)}`;
        }
    }
    throw new Error(lastError);
}

async function callOpenRouterFallback(prompt: string): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'minimax/minimax-m2.5:free',
            temperature: 0.35,
            messages: [
                {
                    role: 'system',
                    content: 'Ти аналітик фудкосту в пекарні. Відповідай тільки українською. Відповідь — суворо JSON без markdown.',
                },
                { role: 'user', content: prompt },
            ],
        }),
    });

    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data?.choices?.[0]?.message?.content?.trim() || '';
}

interface GoalsInput {
    summary: FoodCostSummary;
    categories: CategoryMetrics[];
    targets: {
        fc: number;
        highFcMax: number;
        marginGrowth: number;
    };
}

function buildGoalsPrompt(input: GoalsInput): string {
    const fmt = (n: number) => Math.round(n).toLocaleString('uk-UA');
    const { summary, categories, targets } = input;

    const allProducts: (ProductMetrics & { category_name: string })[] = categories.flatMap(c =>
        c.products.map(p => ({ ...p, category_name: c.category_name }))
    );

    const highFcProducts = allProducts
        .filter(p => p.foodcost_pct > 50 && p.revenue > 300)
        .sort((a, b) => b.foodcost_pct - a.foodcost_pct)
        .slice(0, 10);

    const negMarginProducts = allProducts
        .filter(p => p.margin < 0 && p.revenue > 100);

    const highFcStr = highFcProducts.length > 0
        ? highFcProducts.map(p => `  ${p.product_name} [${p.category_name}]: ФК ${p.foodcost_pct.toFixed(1)}%, маржа ${fmt(p.margin)} грн, ціна ${p.price} грн, продано ${p.qty.toFixed(0)} ${p.unit}`).join('\n')
        : '  немає';

    const negStr = negMarginProducts.length > 0
        ? negMarginProducts.map(p => `  ${p.product_name}: маржа ${fmt(p.margin)} грн, ФК ${p.foodcost_pct.toFixed(1)}%, ціна ${p.price} грн`).join('\n')
        : '  немає';

    const catsStr = categories.map(c =>
        `  ${c.category_name}: ФК ${c.foodcost_pct.toFixed(1)}%, маржа ${fmt(c.margin)} грн (${c.margin_delta_pct > 0 ? '+' : ''}${c.margin_delta_pct.toFixed(1)}%)`
    ).join('\n');

    const fcGap = summary.foodcost_pct - targets.fc;
    const highFcCount = highFcProducts.length;

    return `Ти консультант з оптимізації фудкосту пекарні. Маєш РЕАЛЬНІ дані нижче.

ПОТОЧНИЙ СТАН:
- Фудкост: ${summary.foodcost_pct.toFixed(1)}% → ЦІЛЬ: ${targets.fc}% (потрібно знизити на ${fcGap.toFixed(1)} в.п.)
- Позиції з ФК > 50%: ${highFcCount} шт. → ЦІЛЬ: ≤ ${targets.highFcMax} шт.
- Зміна маржі: ${summary.margin_delta_pct > 0 ? '+' : ''}${summary.margin_delta_pct.toFixed(1)}% → ЦІЛЬ: +${targets.marginGrowth}%
- Загальна маржа: ${fmt(summary.margin)} грн
- Виручка: ${fmt(summary.revenue)} грн

КАТЕГОРІЇ:
${catsStr}

ПОЗИЦІЇ З ФУДКОСТОМ > 50%:
${highFcStr}

ПОЗИЦІЇ З ВІД'ЄМНОЮ МАРЖЕЮ:
${negStr}

Дай конкретний план досягнення кожної цілі. Використовуй ВИКЛЮЧНО назви та цифри з даних вище.

Поверни ТІЛЬКИ JSON:
{
  "fc_advice": {
    "goal": "Знизити ФК до ${targets.fc}%",
    "gap": "${fcGap.toFixed(1)} в.п.",
    "actions": ["конкретна дія 1 з назвами позицій та цифрами", "конкретна дія 2", "конкретна дія 3"]
  },
  "high_fc_advice": {
    "goal": "Скоротити позиції з ФК > 50% до ≤ ${targets.highFcMax}",
    "actions": ["конкретна дія для конкретної позиції з ФК% та рекомендованою ціною або кроком"]
  },
  "margin_advice": {
    "goal": "Збільшити маржу на ${targets.marginGrowth}%",
    "actions": ["конкретна дія 1", "конкретна дія 2", "конкретна дія 3"]
  }
}

ПРАВИЛА:
- Кожна дія — конкретне речення з РЕАЛЬНИМИ назвами позицій, категорій та цифрами з даних.
- Для high_fc_advice: для кожної проблемної позиції вкажи що робити (підняти ціну на X грн / переглянути рецептуру / зняти з продажу).
- Не вигадуй позицій, яких немає в даних.`;
}

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const body = await request.json() as GoalsInput;
        const { summary, categories, targets } = body;

        if (!summary || !categories || !targets) {
            return NextResponse.json({ error: 'Missing data' }, { status: 400 });
        }

        const prompt = buildGoalsPrompt({ summary, categories, targets });

        let rawText: string;
        try {
            rawText = await callGemini(prompt);
        } catch (geminiErr) {
            console.warn('Gemini failed, falling back:', geminiErr);
            rawText = await callOpenRouterFallback(prompt);
        }

        const clean = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

        let parsed: {
            fc_advice: { goal: string; gap: string; actions: string[] };
            high_fc_advice: { goal: string; actions: string[] };
            margin_advice: { goal: string; actions: string[] };
        };

        try {
            parsed = JSON.parse(clean);
        } catch {
            return NextResponse.json({ error: 'AI returned invalid JSON', raw: rawText.slice(0, 500) }, { status: 500 });
        }

        return NextResponse.json(parsed);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        console.error('Goals Advice Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
