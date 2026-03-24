import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Під час білду (prerendering) повертаємо заглушку, щоб не падав білд
export const supabase = (typeof window === 'undefined' && (!supabaseUrl || !supabaseAnonKey))
    ? ({} as any)
    : createClient(
        supabaseUrl || 'https://placeholder.supabase.co',
        supabaseAnonKey || 'placeholder-key',
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            },
            global: {
                headers: {
                    'X-Client-Info': 'bipower-dashboard'
                }
            }
        }
    );

// ✅ Відключаємо Realtime глобально (тільки на клієнті)
if (typeof window !== 'undefined') {
    supabase.realtime.setAuth(null)
    supabase.realtime.disconnect()
}
