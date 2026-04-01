import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

function toList(value: string | undefined) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
}

function inferRole(user: { id?: string; email?: string | null; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }) {
    const defaultRole = String(process.env.RBAC_DEFAULT_ROLE || '').trim().toLowerCase()
    if (defaultRole === 'owner') return 'owner'

    const fromAppMeta = typeof user.app_metadata?.role === 'string' ? user.app_metadata.role : ''
    const fromUserMeta = typeof user.user_metadata?.role === 'string' ? user.user_metadata.role : ''
    const role = String(fromAppMeta || fromUserMeta).trim().toLowerCase()
    if (role) return role

    const ownerEmails = toList(process.env.OWNER_EMAILS)
    const ownerIds = toList(process.env.OWNER_USER_IDS)
    const email = String(user.email || '').toLowerCase()
    const userId = String(user.id || '').toLowerCase()
    if (ownerEmails.includes(email) || ownerIds.includes(userId)) {
        return 'owner'
    }

    return 'restricted'
}

// ─── CORS helpers ─────────────────────────────────────────────────────────────

function parseAllowedOrigins(): string[] {
    return (process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((o) => o.trim().toLowerCase())
        .filter(Boolean)
}

function buildCorsHeaders(origin: string): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
    }
}

function handleCors(request: NextRequest): NextResponse | null {
    const origin = request.headers.get('origin')
    const pathname = request.nextUrl.pathname

    // Only enforce CORS on API routes; no Origin header = server-to-server/cron → pass through
    if (!pathname.startsWith('/api/') || !origin) return null

    // Same-origin requests are never a CORS issue
    const host = request.headers.get('host')
    if (host && origin.toLowerCase() === `https://${host.toLowerCase()}`) return null

    const allowedOrigins = parseAllowedOrigins()

    if (allowedOrigins.length === 0) {
        // No cross-origin allowlist configured — allow same-origin (handled above), block the rest
        if (process.env.NODE_ENV === 'production') {
            console.error(JSON.stringify({
                level: 'error', event: 'CORS_MISCONFIGURED',
                message: 'CORS blocked: cross-origin request and ALLOWED_ORIGINS not set',
                origin, path: pathname, timestamp: new Date().toISOString(),
            }))
            return new NextResponse('Forbidden', { status: 403 })
        }
        return null
    }

    if (!allowedOrigins.includes(origin.toLowerCase())) {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
        console.error(JSON.stringify({
            level: 'error', event: 'CORS_VIOLATION',
            message: 'CORS blocked: origin not in allowlist',
            origin, path: pathname, ip, timestamp: new Date().toISOString(),
        }))
        return new NextResponse('Forbidden', { status: 403 })
    }

    // Preflight
    if (request.method === 'OPTIONS') {
        return new NextResponse(null, { status: 204, headers: buildCorsHeaders(origin) })
    }

    // Allowed — return null so proxy() attaches CORS headers to the pass-through response
    return null
}

// ─── Proxy ────────────────────────────────────────────────────────────────────

export async function proxy(request: NextRequest) {
    // CORS enforcement (API routes with Origin header only)
    const corsResponse = handleCors(request)
    if (corsResponse) return corsResponse

    // Rate limiting (API routes, known IPs only)
    const pathname = request.nextUrl.pathname
    if (pathname.startsWith('/api/')) {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
        if (ip !== 'unknown') {
            const isAI = pathname.startsWith('/api/ai/')
            const rl = await checkRateLimit(ip, isAI)
            if (!rl.allowed) {
                console.error(JSON.stringify({
                    level: 'error', event: 'RATE_LIMITED',
                    ip, path: pathname,
                    retryAfter: rl.retryAfter,
                    timestamp: new Date().toISOString(),
                }))
                return new NextResponse('Too Many Requests', {
                    status: 429,
                    headers: { 'Retry-After': String(rl.retryAfter) },
                })
            }
        }
    }

    const response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // Attach CORS headers to allowed cross-origin API responses
    const origin = request.headers.get('origin')
    if (origin && request.nextUrl.pathname.startsWith('/api/')) {
        const allowedOrigins = parseAllowedOrigins()
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin.toLowerCase())) {
            const corsHeaders = buildCorsHeaders(origin)
            for (const [key, value] of Object.entries(corsHeaders)) {
                response.headers.set(key, value)
            }
        }
    }

    // Публічні шляхи — не потребують авторизації в middleware
    // API routes захищені через requireAuth() в кожному handler
    const isPublic =
        pathname === '/login' ||
        pathname === '/favicon.ico' ||
        pathname.startsWith('/api/') ||              // API захищені через requireAuth() в handlers
        pathname.startsWith('/.well-known') ||
        pathname.startsWith('/_next');

    if (isPublic) {
        return response
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('❌ CRITICAL ERROR [Middleware]: Supabase environment variables are missing!')
    }

    const supabase = createServerClient(
        supabaseUrl || 'https://missing-middleware-url.supabase.co',
        supabaseAnonKey || 'missing-middleware-key',
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        response.cookies.set(name, value, options)
                    })
                },
            },
        }
    )

    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Всё, что не public — требует user
    if (!user) {
        if (pathname.startsWith('/api/')) {
            return NextResponse.json(
                { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
                { status: 401 }
            )
        }
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // Залогінений на /login → на головну
    if (user && pathname === '/login') {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
    }

    if (user && pathname.startsWith('/owner')) {
        const role = inferRole(user)
        if (role !== 'owner') {
            const url = request.nextUrl.clone()
            url.pathname = '/'
            return NextResponse.redirect(url)
        }
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - api/graviton (allow API calls for now, logic will be added later inside API)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
