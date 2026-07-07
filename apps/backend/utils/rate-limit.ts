import { createModuleLogger } from '~/utils/logger';
import { redis } from '~/utils/redis';

const logger = createModuleLogger('RateLimit');

export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_MAX_REQUESTS = 60;
/** Cap on in-memory fallback buckets to protect the 4 GB box */
const MEMORY_BUCKET_CAP = 10_000;

interface MemoryBucket {
  count: number;
  expiresAt: number;
}

/** In-memory fallback when Redis is unavailable */
const memoryStore = new Map<string, MemoryBucket>();
let memoryCleanupScheduled = false;

function scheduleMemoryCleanup() {
  if (memoryCleanupScheduled) return;
  memoryCleanupScheduled = true;
  setTimeout(() => {
    const now = Date.now();
    for (const [key, bucket] of memoryStore) {
      if (bucket.expiresAt <= now) memoryStore.delete(key);
    }
    memoryCleanupScheduled = false;
  }, RATE_LIMIT_WINDOW_SECONDS * 1000);
}

/**
 * Returns true when the request is allowed, false when rate-limited.
 * Uses Redis when available, falls back to an in-memory bounded store.
 */
export async function checkRateLimit(key: string): Promise<boolean> {
  const client = redis.getClient();

  if (client) {
    try {
      const count = await client.incr(key);
      if (count === 1) {
        // First hit in window — set TTL
        await client.expire(key, RATE_LIMIT_WINDOW_SECONDS);
      }
      return count <= RATE_LIMIT_MAX_REQUESTS;
    } catch (error) {
      logger.warn({ err: error }, 'Redis rate-limit error, allowing request');
      return true;
    }
  }

  // --- in-memory fallback ---
  const now = Date.now();
  const existing = memoryStore.get(key);

  if (existing && existing.expiresAt > now) {
    existing.count += 1;
    return existing.count <= RATE_LIMIT_MAX_REQUESTS;
  }

  // Enforce cap before inserting a new bucket
  if (memoryStore.size >= MEMORY_BUCKET_CAP) {
    // Evict expired entries; if still at cap, allow (availability over strictness)
    for (const [k, b] of memoryStore) {
      if (b.expiresAt <= now) memoryStore.delete(k);
    }
    if (memoryStore.size >= MEMORY_BUCKET_CAP) {
      logger.warn('Rate-limit memory store at cap, skipping enforcement');
      return true;
    }
  }

  memoryStore.set(key, {
    count: 1,
    expiresAt: now + RATE_LIMIT_WINDOW_SECONDS * 1000,
  });
  scheduleMemoryCleanup();
  return true;
}
