import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Під час білду (prerendering) на сервері змінні можуть бути відсутні.
    // Повертаємо заглушку, щоб не падав білд, але в браузері це НЕ спрацює.
    if (typeof window === 'undefined' && (!supabaseUrl || !supabaseAnonKey)) {
        return {} as any;
    }

    return createBrowserClient(
        supabaseUrl!,
        supabaseAnonKey!
    );
}
