/**
 * Security event logger.
 *
 * - Writes structured JSON to console (captured by Vercel Logs / Log Drains)
 * - Fire-and-forget insert into `public.security_events` table for DB-side querying
 * - Anomaly detection: if an IP triggers > ANOMALY_THRESHOLD events of the same type
 *   within ANOMALY_WINDOW_MINUTES, a SUSPICIOUS_ACTIVITY event is also emitted
 */

import { createServiceRoleClient } from './branch-api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SecurityEventType =
    | 'AUTH_FAILURE'      // requireAuth() returned 401
    | 'FORBIDDEN'         // requireRole() returned 403
    | 'CORS_VIOLATION'    // origin not in ALLOWED_ORIGINS (logged by middleware)
    | 'RATE_LIMITED'      // request exceeded rate limit (logged by middleware)
    | 'API_ERROR_4XX'     // client error from API route
    | 'API_ERROR_5XX'     // server error from API route
    | 'SUSPICIOUS_ACTIVITY'; // anomaly: too many failures from same IP

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEventPayload {
    event_type: SecurityEventType;
    severity: SecuritySeverity;
    ip_address?: string;
    user_id?: string | null;
    path?: string;
    method?: string;
    status_code?: number;
    user_agent?: string;
    metadata?: Record<string, unknown>;
}

// ─── Anomaly thresholds ───────────────────────────────────────────────────────

const ANOMALY_THRESHOLD = 5;      // events of same type from same IP
const ANOMALY_WINDOW_MINUTES = 15; // within this window

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Log a security event.
 * Non-blocking: returns immediately, DB write is fire-and-forget.
 */
export function logSecurityEvent(event: SecurityEventPayload): void {
    const entry = {
        ...event,
        created_at: new Date().toISOString(),
    };

    // 1. Structured console log (always — captured by Vercel Logs)
    const logLevel = event.severity === 'critical' || event.severity === 'high' ? 'error' : 'warn';
    const logFn = logLevel === 'error' ? console.error : console.warn;
    logFn(
        JSON.stringify({
            level: logLevel,
            security_event: event.event_type,
            severity: event.severity,
            ip: event.ip_address,
            user_id: event.user_id,
            path: event.path,
            status_code: event.status_code,
            timestamp: entry.created_at,
            meta: event.metadata,
        })
    );

    // 2. Fire-and-forget DB write
    persistSecurityEvent(entry);

    // 3. Anomaly check (only for failure events, skip recursive SUSPICIOUS_ACTIVITY)
    if (
        event.event_type !== 'SUSPICIOUS_ACTIVITY' &&
        event.ip_address &&
        event.ip_address !== 'unknown'
    ) {
        checkAnomalyAndAlert(event);
    }
}

/**
 * Extract security-relevant context from a Request object.
 */
export function extractRequestContext(request: Request): {
    ip: string;
    userAgent: string;
    path: string;
    method: string;
} {
    let ip =
        request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        'unknown';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();

    return {
        ip,
        userAgent: (request.headers.get('user-agent') || 'unknown').substring(0, 200),
        path: (() => {
            try {
                return new URL(request.url).pathname;
            } catch {
                return request.url;
            }
        })(),
        method: request.method,
    };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function persistSecurityEvent(entry: SecurityEventPayload & { created_at: string }): void {
    try {
        const supabase = createServiceRoleClient();
        Promise.resolve(
            supabase
                .from('security_events')
                .insert(entry)
        ).then(({ error }) => {
            if (error) {
                console.warn('[security-logger] DB insert failed:', error.message);
            }
        }).catch(() => { /* silent — logging must never crash the request */ });
    } catch {
        // createServiceRoleClient throws if env vars missing (e.g. in test)
    }
}

function checkAnomalyAndAlert(event: SecurityEventPayload): void {
    try {
        const supabase = createServiceRoleClient();
        const windowStart = new Date(
            Date.now() - ANOMALY_WINDOW_MINUTES * 60 * 1000
        ).toISOString();

        Promise.resolve(
            supabase
                .from('security_events')
                .select('id', { count: 'exact', head: true })
                .eq('event_type', event.event_type)
                .eq('ip_address', event.ip_address!)
                .gte('created_at', windowStart)
        ).then(({ count, error }) => {
            if (error || count === null) return;

            if (count >= ANOMALY_THRESHOLD) {
                logSecurityEvent({
                    event_type: 'SUSPICIOUS_ACTIVITY',
                    severity: 'critical',
                    ip_address: event.ip_address,
                    path: event.path,
                    metadata: {
                        trigger_event: event.event_type,
                        count_in_window: count,
                        window_minutes: ANOMALY_WINDOW_MINUTES,
                        threshold: ANOMALY_THRESHOLD,
                    },
                });
            }
        }).catch(() => { /* silent */ });
    } catch {
        /* silent */
    }
}
