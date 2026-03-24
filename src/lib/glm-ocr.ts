type OcrApiResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export type GlmOcrResult = {
  rawResponse: unknown;
  parsedPayload: Record<string, unknown>;
  rawText: string;
  confidence: number | null;
};

function safeJsonParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { text: value };
  }
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractConfidence(payload: Record<string, unknown>): number | null {
  const direct = asNumber(payload.confidence);
  if (direct !== null) return Math.max(0, Math.min(1, direct));

  const scores = payload.field_confidence;
  if (scores && typeof scores === 'object' && !Array.isArray(scores)) {
    const values = Object.values(scores)
      .map((value) => asNumber(value))
      .filter((value): value is number => value !== null);
    if (values.length > 0) {
      const avg = values.reduce((sum, item) => sum + item, 0) / values.length;
      return Math.max(0, Math.min(1, avg));
    }
  }

  return null;
}

export async function runGlmOcr(args: {
  fileBase64: string;
  mimeType: string;
  fileName: string;
}): Promise<GlmOcrResult> {
  const endpoint = process.env.GLM_OCR_API_URL;
  const apiKey = process.env.GLM_OCR_API_KEY;
  const model = process.env.GLM_OCR_MODEL || 'glm-4.1v-thinking-flash';

  if (!endpoint) {
    throw new Error('GLM_OCR_API_URL is not configured');
  }

  const prompt =
    'Extract invoice data from this document. Return strict JSON with keys: invoice_number, invoice_date, supplier_name, total_amount, currency, items (array of {name, qty, unit_price, line_total}), confidence, raw_text.';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${args.mimeType};base64,${args.fileBase64}`,
              },
            },
          ],
        },
      ],
      metadata: {
        filename: args.fileName,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown OCR error');
    throw new Error(`GLM OCR request failed: ${res.status} ${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as OcrApiResponse;
  const content = data.choices?.[0]?.message?.content || '';
  const parsedPayload = safeJsonParse(content);

  const rawTextField = parsedPayload.raw_text;
  const rawText =
    typeof rawTextField === 'string' && rawTextField.trim()
      ? rawTextField
      : typeof parsedPayload.text === 'string'
        ? parsedPayload.text
        : content;

  const confidence = extractConfidence(parsedPayload);

  return {
    rawResponse: data,
    parsedPayload,
    rawText,
    confidence,
  };
}

