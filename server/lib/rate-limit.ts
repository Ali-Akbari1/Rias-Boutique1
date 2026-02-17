interface BucketState {
  count: number;
  resetAt: number;
}

interface RateLimitInput {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const buckets = new Map<string, BucketState>();

const now = () => Date.now();

export const checkRateLimit = ({ key, limit, windowMs }: RateLimitInput): RateLimitResult => {
  const currentTime = now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= currentTime) {
    buckets.set(key, { count: 1, resetAt: currentTime + windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  existing.count += 1;
  const remaining = Math.max(0, limit - existing.count);
  const allowed = existing.count <= limit;

  return {
    allowed,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000)),
  };
};

export const applyRateLimitHeaders = (setHeader: (name: string, value: string) => void, result: RateLimitResult) => {
  setHeader("X-RateLimit-Remaining", String(result.remaining));
  if (!result.allowed) {
    setHeader("Retry-After", String(result.retryAfterSeconds));
  }
};
