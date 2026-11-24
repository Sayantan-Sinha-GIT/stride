const memoryFallback = new Map<string, { value: string; expiresAt: number }>();

export async function kvGetJson<T>(kv: KVNamespace | undefined, key: string): Promise<T | null> {
  if (kv) {
    const raw = await kv.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  const hit = memoryFallback.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    memoryFallback.delete(key);
    return null;
  }
  return JSON.parse(hit.value) as T;
}

export async function kvSetJson(
  kv: KVNamespace | undefined,
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  const serialized = JSON.stringify(value);
  if (kv) {
    await kv.put(key, serialized, { expirationTtl: Math.max(60, ttlSeconds) });
    return;
  }
  memoryFallback.set(key, { value: serialized, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function kvDelete(kv: KVNamespace | undefined, key: string): Promise<void> {
  if (kv) {
    await kv.delete(key);
    return;
  }
  memoryFallback.delete(key);
}

export async function kvIncrementWithTtl(
  kv: KVNamespace | undefined,
  key: string,
  ttlSeconds: number
): Promise<number> {
  const current = (await kvGetJson<{ count: number }>(kv, key))?.count ?? 0;
  const next = current + 1;
  await kvSetJson(kv, key, { count: next }, ttlSeconds);
  return next;
}
