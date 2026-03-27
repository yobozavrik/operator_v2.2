import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const OrderPayloadSchema = z.object({
    order_type: z.string().max(50),
    order: z.array(z.record(z.string(), z.unknown())).max(500),
    summary: z.unknown().optional(),
    critical: z.unknown().optional(),
    generated_at: z.string().optional(),
});

export async function POST(request: NextRequest) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const webhookUrl = process.env.N8N_GRAVITON_ORDER_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error('[submit-order] N8N_GRAVITON_ORDER_WEBHOOK_URL is not configured');
        return NextResponse.json({ success: false, error: 'Webhook not configured' }, { status: 503 });
    }

    try {
        const rawBody = await request.json();
        const parsed = OrderPayloadSchema.safeParse(rawBody);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: 'Invalid order payload', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed.data),
        });

        if (response.ok) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ success: false, error: 'n8n webhook failed' }, { status: response.status });
        }
    } catch (err: any) {
        console.error('Error proxying to n8n:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
