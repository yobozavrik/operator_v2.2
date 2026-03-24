import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

export async function createClient() {
    const cookieStore = await cookies()
    const headerStore = await headers()
    const authHeader = headerStore.get('Authorization')

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // Під час білду (prerendering) або якщо ключі відсутні — повертаємо безпечну заглушку
    if (!supabaseUrl || !supabaseAnonKey) {
        return {
            auth: { getUser: async () => ({ data: { user: null }, error: null }) },
            from: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
            schema: () => ({ from: () => ({ select: () => Promise.resolve({ data: null, error: null }) }) })
        } as any
    }

    return createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            global: {
                headers: authHeader ? { Authorization: authHeader } : {},
            },
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            }
        }
    )
}
