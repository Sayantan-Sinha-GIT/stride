import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

/**
 * Parameterized Neon Serverless HTTP client with scale-to-zero cold start retry.
 */
export function getSql(databaseUrl: string): NeonQueryFunction<false, false> {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured');
  }
  return neon(databaseUrl);
}

export async function queryWithRetry<T = Record<string, unknown>>(
  databaseUrl: string,
  queryFn: (sql: NeonQueryFunction<false, false>) => Promise<T[]>
): Promise<T[]> {
  const sql = getSql(databaseUrl);
  try {
    return await queryFn(sql);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTransient =
      message.includes('ECONNRESET') ||
      message.includes('fetch failed') ||
      message.includes('timeout') ||
      message.includes('Compute is starting') ||
      message.includes('503');
    if (!isTransient) throw err;
    await new Promise((resolve) => setTimeout(resolve, 350));
    return await queryFn(sql);
  }
}

export async function queryRows<T = Record<string, unknown>>(
  databaseUrl: string,
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  return queryWithRetry<T>(databaseUrl, async (sql) => {
    // @neondatabase/serverless exposes sql.query(text, params) in newer versions or sql(strings, ...values)
    // Using sql.query if present, else direct call fallback
    const fn = sql as unknown as {
      query?: (q: string, p?: unknown[]) => Promise<{ rows?: T[] } | T[]>;
      (q: string, p?: unknown[]): Promise<T[]>;
    };
    if (typeof fn.query === 'function') {
      const res = await fn.query(text, params);
      if (Array.isArray(res)) return res;
      return res.rows ?? [];
    }
    return await fn(text, params);
  });
}
