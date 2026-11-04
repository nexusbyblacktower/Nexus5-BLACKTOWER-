import { Request, Response, NextFunction } from 'express';

export interface OperatorProfile {
  id: string;
  name: string;
  role: 'chief_operator' | 'developer' | 'viewer';
  organization: string;
  clearanceLevel: string;
  sessionActive: boolean;
}

const DEFAULT_OPERATOR: OperatorProfile = {
  id: 'bt-operator-01',
  name: 'Kelvin Ong',
  role: 'chief_operator',
  organization: 'BLACKTOWER™',
  clearanceLevel: 'LEVEL 5 // EXECUTIVE',
  sessionActive: true,
};

// Sliding window rate limiter per IP / client session
interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

export function rateLimitMiddleware(maxRequestsPerMinute = 90) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.headers['x-forwarded-for']?.toString() || 'local-session';
    const now = Date.now();
    const bucket = rateBuckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > maxRequestsPerMinute) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please wait a moment before sending additional requests.',
        retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
      });
    }

    return next();
  };
}

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

export function sanitizeErrorMessage(err: unknown): string {
  if (!err) return 'Unknown system error occurred.';
  const raw = err instanceof Error ? err.message : String(err);
  // Ensure no API keys or bearer tokens ever leak in error strings
  return raw
    .replace(/sk-or-v1-[a-zA-Z0-9_-]+/g, '[REDACTED_OPENROUTER_KEY]')
    .replace(/AIza[a-zA-Z0-9_-]+/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]');
}

export function getOperatorProfile(): OperatorProfile {
  return DEFAULT_OPERATOR;
}
