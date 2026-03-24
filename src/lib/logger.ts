export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
    path?: string;
    method?: string;
    status?: number;
    duration?: number;
    userId?: string | null;
    meta?: Record<string, unknown>;
    error?: string;
}

export type AuditAction =
    | 'LOGIN'
    | 'LOGOUT'
    | 'VIEW_METRICS'
    | 'CREATE_ORDER'
    | 'UPDATE_STOCK'
    | 'DISTRIBUTION_RUN'
    | 'DISTRIBUTION_CONFIRM'
    | 'EXPORT_EXCEL'
    | 'VIEW_RESERVE_DEFICIT'
    | 'VIEW_DEFICIT'
    | 'CHANGE_STORE'
    | 'SHARE_ORDER'
    | 'ERROR';

export class Logger {
    private static format(entry: LogEntry): string {
        return JSON.stringify(entry);
    }

    static info(message: string, context?: Partial<LogEntry>) {
        console.log(Logger.format({
            level: 'info',
            message,
            timestamp: new Date().toISOString(),
            ...context
        }));
    }

    static warn(message: string, context?: Partial<LogEntry>) {
        console.warn(Logger.format({
            level: 'warn',
            message,
            timestamp: new Date().toISOString(),
            ...context
        }));
    }

    static error(message: string, context?: Partial<LogEntry>) {
        console.error(Logger.format({
            level: 'error',
            message,
            timestamp: new Date().toISOString(),
            ...context
        }));
    }

    static debug(message: string, context?: Partial<LogEntry>) {
        if (process.env.NODE_ENV === 'development') {
            console.debug(Logger.format({
                level: 'debug',
                message,
                timestamp: new Date().toISOString(),
                ...context
            }));
        }
    }
}

/**
 * Client-side audit log helper.
 * Currently just logs to console using Logger.
 */
export async function auditLog(action: AuditAction, target: string, meta?: Record<string, unknown>) {
    Logger.info(`[ClientAudit] ${action}`, {
        meta: { target, ...meta }
    });
}
