import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Proxy to n8n webhook
        const response = await fetch('https://n8n.dmytrotovstytskyi.online/webhook/graviton-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
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
