import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

/**
 * Health check endpoint for monitoring and load balancer probes.
 * GET /api/healthz → { status: 'ok', timestamp: ... }
 */
export async function GET() {
    return NextResponse.json(
        {
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || '0.1.0',
        },
        {
            status: 200,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
            },
        }
    );
}
