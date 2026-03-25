import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

export async function proxy(request: NextRequest) {
    const response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // Публічні шляхи — не потребують авторизації в middleware
    // API routes захищені через requireAuth() в кожному handler
    const pathname = request.nextUrl.pathname
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
