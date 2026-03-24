import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';

/**
 * Перевіряє авторизацію користувача для API-маршрутів.
 * Повертає user або 401 відповідь.
 *
 * Використання:
 *   const auth = await requireAuth();
 *   if (auth.error) return auth.error;
 *   const user = auth.user;
 */
export async function requireAuth() {
    const supabase = await createClient();

    let user = null;
    let cookieError = null;

    // 1. Try Cookie Auth
    try {
        const { data, error } = await supabase.auth.getUser();
        user = data.user;
        cookieError = error;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[AUTH-GUARD] Cookie auth threw:', message);
    }

    if (user) {
        return { user, error: null };
    }

    // 2. Try Bearer Token (if cookie failed)
    const { headers } = await import('next/headers');
    const headerList = await headers();
    const authHeader = headerList.get('Authorization');

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const { data: { user: userFromToken }, error: tokenError } = await supabase.auth.getUser(token);

            if (userFromToken) {
                return { user: userFromToken, error: null };
            }

            console.log('[AUTH-GUARD] Token auth failed:', tokenError?.message);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[AUTH-GUARD] Token auth threw:', message);
        }
    }

    // 🔍 DEBUG LOG
    console.log('[AUTH-GUARD] Auth failed. Cookie error:', cookieError?.message);

    return {
        user: null,
        error: NextResponse.json(
            { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
            { status: 401 }
        ),
    };
}

function toList(value: string | undefined) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

export function getUserRole(user: User): string {
    const defaultRole = String(process.env.RBAC_DEFAULT_ROLE || '').trim().toLowerCase();
    if (defaultRole === 'owner') return 'owner';

    const fromAppMeta = typeof user.app_metadata?.role === 'string' ? user.app_metadata.role : null;
    const fromUserMeta = typeof user.user_metadata?.role === 'string' ? user.user_metadata.role : null;
    const role = (fromAppMeta || fromUserMeta || '').trim().toLowerCase();
    if (role) return role;

    const ownerEmails = toList(process.env.OWNER_EMAILS);
    const ownerIds = toList(process.env.OWNER_USER_IDS);
    const email = String(user.email || '').toLowerCase();
    const userId = String(user.id || '').toLowerCase();

    if (ownerEmails.includes(email) || ownerIds.includes(userId)) {
        return 'owner';
    }

    return 'restricted';
}

export async function requireRole(allowedRoles: string[]) {
    const auth = await requireAuth();
    if (auth.error || !auth.user) return auth;

    const role = getUserRole(auth.user);
    const normalizedAllowed = allowedRoles.map((item) => item.toLowerCase());
    if (normalizedAllowed.includes(role)) {
        return { ...auth, role, error: null };
    }

    return {
        user: auth.user,
        role,
        error: NextResponse.json(
            { error: 'Forbidden', code: 'AUTH_FORBIDDEN', role },
            { status: 403 }
        ),
    };
}
