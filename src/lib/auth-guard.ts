import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { logSecurityEvent } from './security-logger';

export type AuthResult =
    | { user: User; error: null }
    | { user: null; error: NextResponse };

export type AuthRoleResult =
    | { user: User; role: string; error: null }
    | { user: User | null; role: string | null; error: NextResponse };

/**
 * Перевіряє авторизацію користувача для API-маршрутів.
 * Повертає user або 401 відповідь.
 */
export async function requireAuth(): Promise<AuthResult> {
    const supabase = await createClient();

    let user: User | null = null;
    let cookieError = null;

    // 0. Try Bypass (Development only)
    if (process.env.NODE_ENV === 'development') {
        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        if (cookieStore.get('bypass_auth')?.value === 'true') {
            return {
                user: { id: 'benchmark-user', email: 'benchmark@local' } as User,
                error: null
            };
        }
    }

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

    console.error('[AUTH-GUARD] Auth failed. Cookie error:', cookieError?.message);

    logSecurityEvent({
        event_type: 'AUTH_FAILURE',
        severity: 'medium',
        metadata: {
            cookie_error: cookieError?.message ?? null,
        },
    });

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

export async function requireRole(allowedRoles: string[]): Promise<AuthRoleResult> {
    const auth = await requireAuth();
    if (auth.error) {
        // Here TypeScript knows user is null and error is NextResponse
        return { user: null, role: null, error: auth.error };
    }

    // Here TypeScript knows user is User and error is null
    const role = getUserRole(auth.user);
    const normalizedAllowed = allowedRoles.map((item) => item.toLowerCase());
    if (normalizedAllowed.includes(role)) {
        return { user: auth.user, role, error: null };
    }

    logSecurityEvent({
        event_type: 'FORBIDDEN',
        severity: 'medium',
        user_id: auth.user.id,
        status_code: 403,
        metadata: {
            actual_role: role,
            required_roles: allowedRoles,
        },
    });

    return {
        user: auth.user,
        role,
        error: NextResponse.json(
            { error: 'Forbidden', code: 'AUTH_FORBIDDEN', role },
            { status: 403 }
        ),
    } as AuthRoleResult;
}
