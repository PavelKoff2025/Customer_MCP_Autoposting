export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  retryAfterMs?: number;
  shouldRetry?: (error: unknown) => boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultShouldRetry(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const err = error as {
      response?: { status?: number; data?: { parameters?: { retry_after?: number } } };
      status?: number;
      code?: number | string;
    };
    const status = err.response?.status ?? err.status;
    if (status === 429 || status === 503) return true;
    if (err.code === 6 || err.code === 4 || err.code === 36003) return true;
  }
  return false;
}

export function getRetryAfterMs(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const err = error as {
    response?: {
      headers?: Record<string, string>;
      data?: {
        parameters?: { retry_after?: number };
        error?: { code?: number };
      };
    };
    retryAfterMs?: number;
  };
  if (typeof err.retryAfterMs === "number") return err.retryAfterMs;
  const retryAfterHeader = err.response?.headers?.["retry-after"];
  if (retryAfterHeader) {
    const sec = Number(retryAfterHeader);
    if (!Number.isNaN(sec)) return sec * 1000;
  }
  const tg = err.response?.data?.parameters?.retry_after;
  if (typeof tg === "number") return tg * 1000;
  const code = err.response?.data?.error?.code;
  if (code === 36003) return 5000;
  if (code === 4) return 60_000;
  return undefined;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      const fromError = getRetryAfterMs(error);
      const delay =
        options.retryAfterMs ??
        fromError ??
        baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
  throw lastError;
}
