/**
 * SocietyFix AI — Structured Logger for Google Cloud Logging
 * Formats logs as JSON matching Google Cloud Logging entry schema:
 * https://cloud.google.com/logging/docs/structured-logging
 */

export type LogSeverity = 'DEFAULT' | 'DEBUG' | 'INFO' | 'NOTICE' | 'WARNING' | 'ERROR' | 'CRITICAL' | 'ALERT' | 'EMERGENCY';

export interface LogContext {
  component?: string;
  societyId?: string;
  userId?: string;
  trace?: string;
  spanId?: string;
  httpRequest?: {
    requestMethod?: string;
    requestUrl?: string;
    status?: number;
    userAgent?: string;
    remoteIp?: string;
    latency?: string;
    protocol?: string;
  };
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'apiKey',
  'gemini_api_key',
  'credit_card',
  'cvv',
  'pan',
  'aadhaar'
]);

/**
 * Redacts sensitive fields recursively from log payloads to prevent accidental credential/PII leaks.
 */
function sanitizePayload(obj: unknown, depth = 0): unknown {
  if (depth > 4 || obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizePayload(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizePayload(val, depth + 1);
    }
  }
  return sanitized;
}

export function log(severity: LogSeverity, message: string, context?: LogContext): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const timestamp = new Date().toISOString();

  const payload: Record<string, unknown> = {
    severity,
    message,
    timestamp,
    service: 'societyfix-api',
    env: process.env.NODE_ENV || 'development',
    ...(context ? (sanitizePayload(context) as Record<string, unknown>) : {})
  };

  if (isProduction) {
    // GCP Cloud Run captures single-line JSON on stdout
    process.stdout.write(JSON.stringify(payload) + '\n');
  } else {
    // Human-readable dev output
    const prefix = `[${timestamp}] [${severity}]`;
    if (severity === 'ERROR' || severity === 'CRITICAL') {
      console.error(`${prefix} ${message}`, context || '');
    } else if (severity === 'WARNING') {
      console.warn(`${prefix} ${message}`, context || '');
    } else {
      console.log(`${prefix} ${message}`, context || '');
    }
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => log('DEBUG', msg, ctx),
  info: (msg: string, ctx?: LogContext) => log('INFO', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log('WARNING', msg, ctx),
  error: (msg: string, ctx?: LogContext) => log('ERROR', msg, ctx),
  critical: (msg: string, ctx?: LogContext) => log('CRITICAL', msg, ctx),
};
