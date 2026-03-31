import { createBrowserClient } from '@supabase/ssr';

// Singleton: один інстанс GoTrueClient на весь браузерний контекст.
// Без singleton кожен виклик createClient() створює новий GoTrueClient
// і браузер логує "Multiple GoTrueClient instances detected".
let _instance: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Під час білду (prerendering) на сервері змінні можуть бути відсутні.
    // Повертаємо заглушку, щоб не падав білд, але в браузері це НЕ спрацює.
    if (typeof window === 'undefined' && (!supabaseUrl || !supabaseAnonKey)) {
        return {} as any;
    }

    if (!_instance) {
        _instance = createBrowserClient(supabaseUrl!, supabaseAnonKey!);
    }
    return _instance;
}
