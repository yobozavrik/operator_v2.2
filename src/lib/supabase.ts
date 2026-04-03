import { createClient } from '@/utils/supabase/client';

/**
 * Глобальний інстанс supabase (клієнтська сторона).
 * Тепер використовує спільний сінглтон із @/utils/supabase/client, 
 * щоб уникнути помилки "Multiple GoTrueClient instances".
 */
export const supabase = createClient();

// ✅ Відключаємо Realtime глобально (тільки на клієнті), якщо інстанс підтримує це
if (typeof window !== 'undefined' && supabase.realtime) {
    try {
        supabase.realtime.setAuth(null);
        supabase.realtime.disconnect();
    } catch {
        // Ignore if realtime is not initialized
    }
}
