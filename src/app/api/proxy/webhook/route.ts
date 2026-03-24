import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Forward to local n8n webhook
        // Use host.docker.internal if running in Docker, otherwise localhost
        // Since this is server-side Next.js, localhost refers to the machine running Next.js
        const targetUrl = 'http://localhost:5678/webhook-test/operator';

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Webhook failed: ${response.statusText}` },
                { status: response.status }
            );
        }

        const data = await response.json().catch(() => ({ success: true })); // Handle empty/text responses
        return NextResponse.json(data);

    } catch (error) {
        console.error('Proxy Error:', error);
        return NextResponse.json(
            { error: 'Internal Proxy Error' },
            { status: 500 }
        );
    }
}
