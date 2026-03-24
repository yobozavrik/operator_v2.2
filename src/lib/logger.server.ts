import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { AuditAction, Logger } from './logger';

/**
 * Server-side audit log (for API routes).
 * Captures IP address from request headers.
 */
export async function serverAuditLog(
    action: AuditAction,
    target: string,
    request: Request,
    metadata?: Record<string, unknown>,
    userId?: string | null
): Promise<void> {
    // 1. IP Normalization
    let ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    if (ip.includes(',')) {
        ip = ip.split(',')[0].trim();
    }

    // 3. user_agent Hardening (max 200 chars strictly)
    let userAgent = request.headers.get('user-agent') || 'unknown';
    if (userAgent.length > 200) {
        userAgent = userAgent.substring(0, 197) + '...';
    }

    // 2. Metadata Sanitization
    const safeMetadata = sanitizeMetadata(metadata);

    const entry = {
        user_id: userId ?? null,
        action,
        target,
        metadata: safeMetadata,
        ip_address: ip,
        user_agent: userAgent,
        created_at: new Date().toISOString(),
    };

    // 3. Fire-and-forget Insert
    // We do NOT await this promise to avoid blocking the API response.
    // However, we must handle the promise rejection to avoid "Unhandled Rejection" warnings.
    createServerSupabase()
        .then(supabase => supabase.from('audit_logs').insert(entry))
        .then(({ error }) => {
            if (error) {
                // Minimal console log on error
                Logger.warn('[ServerAuditLog] Supabase insert failed', {
                    meta: {
                        action,
                        target,
                        error: error.message,
                        code: error.code
                    }
                });
            } else {
                // Minimal console log on success
                Logger.info('[ServerAuditLog] Action recorded', {
                    meta: {
                        action,
                        target,
                        user_id: userId ?? null,
                        ip_address: ip,
                        ok: true
                    }
                });
            }
        })
        .catch(err => {
            Logger.error('[ServerAuditLog] Exception', {
                error: err.message || String(err),
                meta: { action, target }
            });
        });
}

function sanitizeMetadata(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!meta) return undefined;

    try {
        // 2) Strict Production Mode (allowlist)
        if (process.env.AUDIT_STRICT_MODE === 'true') {
            const ALLOWLIST = new Set([
                'store_id', 'product_id', 'qty', 'amount', 'order_id',
                'route', 'status', 'status_code', 'duration_ms', 'error_code'
            ]);

            const filtered: Record<string, unknown> = { _strict: true };
            for (const [key, value] of Object.entries(meta)) {
                if (ALLOWLIST.has(key)) {
                    filtered[key] = value;
                }
            }
            return filtered;
        }

        // Standard Mode with PII Redaction
        const redacted = JSON.parse(JSON.stringify(meta), (key, value) => {
            // 1. Redact secrets
            if (/password|token|key|authorization|secret/i.test(key)) {
                return '[REDACTED]';
            }
            // 2. Redact PII
            if (/email|phone|name|address|comment|message|customer|client|first_name|last_name|full_name/i.test(key)) {
                return '[REDACTED_PII]';
            }
            // 3. Check string values for JWT-like patterns
            if (typeof value === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
                return '[REDACTED_TOKEN]';
            }
            return value;
        });

        // Size check (approximate via JSON string length)
        const jsonStr = JSON.stringify(redacted);
        if (jsonStr.length > 8192) { // 8KB limit
            return {
                _truncated: true,
                originalSize: jsonStr.length,
                keys: Object.keys(redacted).slice(0, 50)
            };
        }

        return redacted;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
        return { _error: 'Metadata sanitization failed' };
    }
}
