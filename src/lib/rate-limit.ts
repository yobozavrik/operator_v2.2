/**
 * Distributed rate limiting via Upstash Redis.
 *
 * Owner layer: shared atomic store across all serverless instances.
 * Falls open (allows traffic) when UPSTASH env vars are not configured —
 * this is intentional: prefer availability over accidental lockouts during
 * initial deployment. Log a warning so ops knows to configure it.
 *
 * Setup: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel
 * dashboard (or .env.local). Create a free Redis database at upstash.com.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ─── Singleton instances ───────────────────────────────────────────────────────

let generalLimiter: Ratelimit | null = null;
let aiLimiter: Ratelimit | null = null;
let _initialized = false;

function getOrCreateLimiters(): { general: Ratelimit | null; ai: Ratelimit | null } {
    if (_initialized) return { general: generalLimiter, ai: aiLimiter };
    _initialized = true;

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        if (process.env.NODE_ENV === 'production') {
            console.warn(
                '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set. ' +
                'Rate limiting is DISABLED. Configure Upstash Redis to enable distributed rate limiting.'
            );
        }
        return { general: null, ai: null };
    }

    const redis = new Redis({ url, token });

    generalLimiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(200, '1 m'),
        prefix: 'rl:general',
        analytics: false,
    });

    aiLimiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '1 m'),
        prefix: 'rl:ai',
        analytics: false,
    });

    return { general: generalLimiter, ai: aiLimiter };
}

// ─── Public API ────────────────────────────────────────────────────────────────

export type RateLimitResult =
    | { allowed: true }
    | { allowed: false; retryAfter: number };

/**
 * Check rate limit for a given IP and route type.
 * Returns { allowed: true } when Upstash is not configured (fail-open).
 */
export async function checkRateLimit(
    ip: string,
    isAI: boolean
): Promise<RateLimitResult> {
    const { general, ai } = getOrCreateLimiters();
    const limiter = isAI ? ai : general;

    if (!limiter) return { allowed: true };

    const { success, reset } = await limiter.limit(ip);
    if (success) return { allowed: true };

    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return { allowed: false, retryAfter };
}
