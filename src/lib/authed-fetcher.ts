import { createClient } from '@/utils/supabase/client';

/**
 * SWR fetcher з автоматичною авторизацією.
 * Бере access_token із supabase.auth.getSession() і шле Authorization: Bearer <token>.
 */
export const authedFetcher = async (url: string) => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();

    // 🔍 TEMP DEBUG LOG
    console.log('[authedFetcher] url=', url, 'hasSession=', !!data.session, 'err=', error?.message);

    const token = data.session?.access_token;

    const headers: Record<string, string> = {
        Accept: 'application/json',
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
        credentials: 'include', // keep include for cookie flow backup
        headers,
    });

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!res.ok) {
        let info: unknown = {};
        if (isJson) {
            info = await res.json().catch(() => ({}));
        } else {
            const text = await res.text().catch(() => '');
            info = { message: text.slice(0, 300) };
        }

        const errorVal = new Error('Fetch failed');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (errorVal as any).status = res.status;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (errorVal as any).info = info;
        throw errorVal;
    }

    if (!isJson) {
        const text = await res.text().catch(() => '');
        const errorVal = new Error('Expected JSON response but received non-JSON content');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (errorVal as any).status = res.status;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (errorVal as any).info = { message: text.slice(0, 300) };
        throw errorVal;
    }

    return res.json();
};
