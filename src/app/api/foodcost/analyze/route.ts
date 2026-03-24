import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import type { FoodCostSummary, CategoryMetrics } from '@/app/api/foodcost/route';

export const dynamic = 'force-dynamic';

async function callGemini(prompt: string): Promise<string> {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not configured');

    const systemInstruction = [
        'Ти аналітик фудкосту в пекарні/кулінарії в Україні.',
        'Відповідай тільки українською мовою.',
        'Відповідь — суворо JSON без коментарів і без markdown-блоку ```json.',
        'Будь конкретним: вказуй лише назви і цифри з наданих даних.',
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
                        temperature: 0.3,
                        maxOutputTokens: 1024,
                        responseMimeType: 'application/json',
                    },
                }),
            });

            if (!res.ok) {
                const err = await res.text();
                lastError = `${model}: HTTP ${res.status} — ${err.slice(0, 200)}`;
                console.warn('Gemini model failed:', lastError);
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
            console.warn('Gemini model failed:', lastError);
        }
    }
    throw new Error(lastError);
}

async function callOpenRouterFallback(prompt: string): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

    const systemPrompt = [
        'Ти аналітик фудкосту в пекарні/кулінарії в Україні.',
        'Відповідай тільки українською мовою.',
        'Відповідь — суворо JSON без коментарів і без markdown-блоку ```json.',
    ].join(' ');

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'minimax/minimax-m2.5:free',
            temperature: 0.3,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ],
        }),
    });

    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data?.choices?.[0]?.message?.content?.trim() || '';
}

function buildPrompt(summary: FoodCostSummary, categories: CategoryMetrics[]): string {
    const fmt = (n: number) => Math.round(n).toLocaleString('uk-UA');
    const sign = (n: number) => n > 0 ? '+' : '';

    // All products flat
    const allProducts = categories.flatMap(c =>
        c.products.map(p => ({ ...p, category_name: c.category_name }))
    );

    // Categories formatted
    const catsStr = categories.map(c =>
        `  ${c.category_name} (${c.products.length} поз.): ФК ${c.foodcost_pct.toFixed(1)}% (${sign(c.foodcost_delta)}${c.foodcost_delta.toFixed(1)} в.п.), маржа ${fmt(c.margin)} грн (${sign(c.margin_delta_pct)}${c.margin_delta_pct.toFixed(1)}%)`
    ).join('\n');

    // High FC products (>50%)
    const highFcStr = allProducts
        .filter(p => p.foodcost_pct > 50 && p.revenue > 300)
        .sort((a, b) => b.foodcost_pct - a.foodcost_pct)
        .slice(0, 8)
        .map(p => `  ${p.product_name} [${p.category_name}]: ФК ${p.foodcost_pct.toFixed(1)}% (${sign(p.foodcost_delta)}${p.foodcost_delta.toFixed(1)} в.п.), маржа ${fmt(p.margin)} грн`)
        .join('\n') || '  немає';

    // Biggest FC risers
    const fcRisers = allProducts
        .filter(p => p.foodcost_delta > 1 && p.revenue > 500)
        .sort((a, b) => b.foodcost_delta - a.foodcost_delta)
        .slice(0, 5)
        .map(p => `  ${p.product_name}: ${p.foodcost_pct_prev.toFixed(1)}% → ${p.foodcost_pct.toFixed(1)}% (+${p.foodcost_delta.toFixed(1)} в.п.), ціна ${p.price} грн`)
        .join('\n') || '  немає';

    // Biggest FC fallers (cost decreased = good)
    const fcFallers = allProducts
        .filter(p => p.foodcost_delta < -1 && p.revenue > 500)
        .sort((a, b) => a.foodcost_delta - b.foodcost_delta)
        .slice(0, 4)
        .map(p => `  ${p.product_name}: ${p.foodcost_pct_prev.toFixed(1)}% → ${p.foodcost_pct.toFixed(1)}% (${p.foodcost_delta.toFixed(1)} в.п.)`)
        .join('\n') || '  немає';

    // Top margin contributors
    const topMarginStr = allProducts
        .sort((a, b) => b.margin - a.margin)
        .slice(0, 6)
        .map(p => `  ${p.product_name} [${p.category_name}]: маржа ${fmt(p.margin)} грн (${sign(p.margin_delta_pct)}${p.margin_delta_pct.toFixed(1)}%), продано ${p.qty.toFixed(0)} ${p.unit}`)
        .join('\n');

    // Falling margin products
    const fallingStr = allProducts
        .filter(p => p.margin_delta_pct < -5 && p.margin_prev > 1000)
        .sort((a, b) => a.margin_delta_pct - b.margin_delta_pct)
        .slice(0, 4)
        .map(p => `  ${p.product_name} [${p.category_name}]: маржа ${sign(p.margin_delta_pct)}${p.margin_delta_pct.toFixed(1)}%, поточна ${fmt(p.margin)} грн`)
        .join('\n') || '  немає';

    // Negative margin products
    const negMarginStr = allProducts
        .filter(p => p.margin < 0 && p.revenue > 100)
        .map(p => `  ${p.product_name}: маржа ${fmt(p.margin)} грн, ФК ${p.foodcost_pct.toFixed(1)}%`)
        .join('\n') || '  немає';

    return `Ти аналітик фудкосту пекарні. Маєш РЕАЛЬНІ дані нижче. Не вигадуй жодних назв чи цифр — використовуй виключно те, що надано.

ЗАГАЛЬНІ ПОКАЗНИКИ (поточний vs попередній період):
- Дохід: ${fmt(summary.revenue)} грн (${sign(summary.revenue_delta_pct)}${summary.revenue_delta_pct.toFixed(1)}%)
- Собівартість: ${fmt(summary.cost)} грн (${sign(summary.cost_delta_pct)}${summary.cost_delta_pct.toFixed(1)}%)
- Маржа: ${fmt(summary.margin)} грн (${sign(summary.margin_delta_pct)}${summary.margin_delta_pct.toFixed(1)}%)
- Фудкост: ${summary.foodcost_pct.toFixed(1)}% (${sign(summary.foodcost_delta)}${summary.foodcost_delta.toFixed(2)} в.п.)

КАТЕГОРІЇ (фудкост, дельта, маржа, дельта маржі):
${catsStr}

ПОЗИЦІЇ З ФУДКОСТОМ >50% (проблемні):
${highFcStr}

ПОЗИЦІЇ ДЕ ФУДКОСТ ЗРІС НАЙБІЛЬШЕ (погіршення):
${fcRisers}

ПОЗИЦІЇ ДЕ ФУДКОСТ ЗНИЗИВСЯ (покращення):
${fcFallers}

ТОП-6 ПОЗИЦІЙ ЗА МАРЖЕЮ:
${topMarginStr}

ПОЗИЦІЇ З ПАДІННЯМ МАРЖІ (>5%):
${fallingStr}

ПОЗИЦІЇ З ВІД'ЄМНОЮ МАРЖЕЮ:
${negMarginStr}

Поверни ТІЛЬКИ JSON (без markdown, без пояснень):
{
  "summary": "...",
  "drivers": ["рядок1", "рядок2", "рядок3"],
  "problems": ["рядок1", "рядок2", "рядок3"]
}

ОБОВ'ЯЗКОВІ ПРАВИЛА ФОРМАТУ:
1. summary — одне речення: загальний фудкост%, дельта в.п., маржа грн, дельта маржі%.
2. drivers — рівно 3 рядки з ТАКИМИ заголовками (і таким розділювачем):
   "Зміна цін постачання — [конкретні продукти з даних вище з цифрами до/після або в.п.]"
   "Зміна структури продажів — [категорії що дали приріст/спад маржі з тис. грн]"
   "Зміна рецептур — [продукти де собівартість змінилась без зміни ціни, або 'суттєвих змін не зафіксовано']"
3. problems — 2-3 рядки з ТАКИМИ заголовками:
   "Від'ємна маржа та високий фудкост — [конкретні позиції з ФК% та сумою маржі]"
   "Високий фудкост (>50%) — [перелік позицій з точними відсотками]"
   "Спад продажів — [категорії/позиції з падінням маржі або виручки в %]" (якщо є дані)
4. Якщо для розділу немає даних — напиши "даних для цього розділу не виявлено".
5. Кожен рядок: "Заголовок — детальний текст з РЕАЛЬНИМИ назвами та цифрами з даних."`;
}

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const body = await request.json() as {
            summary: FoodCostSummary;
            categories: CategoryMetrics[];
        };

        const { summary, categories } = body;
        if (!summary || !categories) {
            return NextResponse.json({ error: 'Missing data' }, { status: 400 });
        }

        const prompt = buildPrompt(summary, categories);
        let rawText: string;
        try {
            rawText = await callGemini(prompt);
        } catch (geminiErr) {
            console.warn('Gemini failed, falling back to OpenRouter:', geminiErr);
            rawText = await callOpenRouterFallback(prompt);
        }

        // Parse JSON from AI response
        let parsed: { summary: string; drivers: string[]; problems: string[] };
        try {
            // Strip potential markdown code block wrappers
            const clean = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            parsed = JSON.parse(clean);
        } catch {
            // Fallback if AI didn't return valid JSON
            parsed = {
                summary: rawText.split('\n')[0] || '',
                drivers: [],
                problems: [],
            };
        }

        return NextResponse.json({
            summary: parsed.summary || '',
            drivers: Array.isArray(parsed.drivers) ? parsed.drivers : [],
            problems: Array.isArray(parsed.problems) ? parsed.problems : [],
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        console.error('FoodCost Analyze Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
