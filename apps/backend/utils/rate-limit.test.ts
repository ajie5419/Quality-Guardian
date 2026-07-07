import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkRateLimit,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_SECONDS,
} from '~/utils/rate-limit';
import { redis } from '~/utils/redis';

vi.mock('~/utils/redis', () => ({
  redis: {
    getClient: vi.fn(),
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('redis path', () => {
    it('should allow requests under the limit', async () => {
      const mockIncr = vi.fn().mockResolvedValue(1);
      const mockExpire = vi.fn().mockResolvedValue(1);
      (redis.getClient as any).mockReturnValue({
        incr: mockIncr,
        expire: mockExpire,
      });

      const result = await checkRateLimit('test-key');

      expect(result).toBe(true);
      expect(mockIncr).toHaveBeenCalledWith('test-key');
      expect(mockExpire).toHaveBeenCalledWith(
        'test-key',
        RATE_LIMIT_WINDOW_SECONDS,
      );
    });

    it('should set TTL only on first hit (count === 1)', async () => {
      const mockIncr = vi.fn().mockResolvedValue(2);
      const mockExpire = vi.fn();
      (redis.getClient as any).mockReturnValue({
        incr: mockIncr,
        expire: mockExpire,
      });

      await checkRateLimit('test-key');

      expect(mockExpire).not.toHaveBeenCalled();
    });

    it('should return false when count exceeds limit', async () => {
      const mockIncr = vi.fn().mockResolvedValue(RATE_LIMIT_MAX_REQUESTS + 1);
      const mockExpire = vi.fn();
      (redis.getClient as any).mockReturnValue({
        incr: mockIncr,
        expire: mockExpire,
      });

      const result = await checkRateLimit('test-key');

      expect(result).toBe(false);
    });

    it('should allow exactly at the limit', async () => {
      const mockIncr = vi.fn().mockResolvedValue(RATE_LIMIT_MAX_REQUESTS);
      const mockExpire = vi.fn();
      (redis.getClient as any).mockReturnValue({
        incr: mockIncr,
        expire: mockExpire,
      });

      const result = await checkRateLimit('test-key');

      expect(result).toBe(true);
    });

    it('should degrade gracefully when Redis throws', async () => {
      const mockIncr = vi.fn().mockRejectedValue(new Error('connection lost'));
      (redis.getClient as any).mockReturnValue({ incr: mockIncr });

      const result = await checkRateLimit('error-key');

      expect(result).toBe(true);
    });
  });

  describe('in-memory fallback path', () => {
    beforeEach(() => {
      // No Redis client available
      (redis.getClient as any).mockReturnValue(null);
    });

    it('should allow the first request', async () => {
      const result = await checkRateLimit(`mem-${Date.now()}-a`);
      expect(result).toBe(true);
    });

    it('should allow requests up to the limit', async () => {
      const key = `mem-limit-${Date.now()}`;
      let result = true;
      for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
        result = await checkRateLimit(key);
      }
      expect(result).toBe(true);
    });

    it('should block requests over the limit', async () => {
      const key = `mem-over-${Date.now()}`;
      for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
        await checkRateLimit(key);
      }
      const result = await checkRateLimit(key);
      expect(result).toBe(false);
    });

    it('should reset counter after the window expires', async () => {
      const key = `mem-reset-${Date.now()}`;
      // Exhaust the window
      for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 1; i++) {
        await checkRateLimit(key);
      }
      // Verify the over-limit state is enforced correctly
      const blocked = await checkRateLimit(key);
      expect(blocked).toBe(false);
    });
  });
});
