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
const resolveUpstashConfig = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim() || "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || "";
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
};

const encodeRedisArgs = (parts: Array<string | number>) => parts.map((part) => encodeURIComponent(String(part))).join("/");

const runUpstashCommand = async <T>(command: string, args: Array<string | number>) => {
  const config = resolveUpstashConfig();
  if (!config) {
    return null;
  }

  const response = await fetch(`${config.url}/${command}/${encodeRedisArgs(args)}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Upstash rate limit command failed with ${response.status}.`);
  }

  const payload = (await response.json()) as { result?: T; error?: string };
  if (payload.error) {
    throw new Error(payload.error);
  }

  return payload.result as T;
};

const checkMemoryRateLimit = ({ key, limit, windowMs }: RateLimitInput): RateLimitResult => {
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

export const checkRateLimit = async ({ key, limit, windowMs }: RateLimitInput): Promise<RateLimitResult> => {
  const config = resolveUpstashConfig();
  if (!config) {
    return checkMemoryRateLimit({ key, limit, windowMs });
  }

  const namespacedKey = `rate-limit:${key}`;

  try {
    const count = Number((await runUpstashCommand<number>("INCR", [namespacedKey])) || 0);
    if (count <= 1) {
      await runUpstashCommand<number>("PEXPIRE", [namespacedKey, windowMs]);
    }

    const ttlMs = Number((await runUpstashCommand<number>("PTTL", [namespacedKey])) || windowMs);
    const retryAfterSeconds = Math.max(1, Math.ceil(Math.max(ttlMs, 1) / 1000));

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds,
    };
  } catch {
    return checkMemoryRateLimit({ key, limit, windowMs });
  }
};

export const applyRateLimitHeaders = (setHeader: (name: string, value: string) => void, result: RateLimitResult) => {
  setHeader("X-RateLimit-Remaining", String(result.remaining));
  if (!result.allowed) {
    setHeader("Retry-After", String(result.retryAfterSeconds));
  }
};
