import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('http://', 'https://')
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase credentials')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
})

// ✅ Відключаємо Realtime глобально (тільки на клієнті)
if (typeof window !== 'undefined') {
    supabase.realtime.setAuth(null)
    supabase.realtime.disconnect()
}
