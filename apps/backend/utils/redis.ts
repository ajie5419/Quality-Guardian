import process from 'node:process';

import Redis from 'ioredis';

import { createModuleLogger } from './logger';

const logger = createModuleLogger('Redis');

class RedisManager {
  private static instance: RedisManager;
  private client: null | Redis = null;
  private connectionErrorLogged = false;
  private isEnabled = false;

  private constructor() {
    const url = process.env.REDIS_URL;
    const redisEnabled = process.env.REDIS_ENABLED !== 'false';
    const isDev = process.env.NODE_ENV === 'development';
    const optionalMode = isDev || process.env.REDIS_OPTIONAL === 'true';

    if (url && redisEnabled) {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          // In optional mode (usually local development), stop retrying quickly
          // to avoid log flooding when Redis is not running.
          if (optionalMode && times >= 2) {
            return null;
          }
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      this.client.on('connect', () => {
        logger.info('Redis connected');
        this.isEnabled = true;
        this.connectionErrorLogged = false;
      });

      this.client.on('error', (err) => {
        if (optionalMode) {
          if (!this.connectionErrorLogged) {
            logger.warn(
              { err },
              'Redis unavailable, cache fallback enabled (dev optional mode)',
            );
            this.connectionErrorLogged = true;
          }
        } else {
          logger.error({ err }, 'Redis connection error');
        }
        this.isEnabled = false;
      });
    } else if (redisEnabled) {
      logger.warn('REDIS_URL not found, caching disabled');
    } else {
      logger.warn('Redis disabled by REDIS_ENABLED=false, caching disabled');
    }
  }

  public static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  /**
   * Delete key(s)
   */
  public async del(...keys: string[]): Promise<void> {
    if (!this.isEnabled || !this.client) return;
    try {
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      logger.error({ err: error, keys }, 'Redis del error');
    }
  }

  /**
   * Delete keys by pattern
   * Warning: standard KEYS command is slow, but acceptable for admin operations
   */
  public async delByPattern(pattern: string): Promise<void> {
    if (!this.isEnabled || !this.client) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      logger.error({ err: error, pattern }, 'Redis delByPattern error');
    }
  }

  /**
   * Safe get method that swallows errors and returns null on failure
   */
  public async get<T>(key: string): Promise<null | T> {
    if (!this.isEnabled || !this.client) return null;
    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error({ err: error, key }, 'Redis get error');
      return null;
    }
  }

  public getClient(): null | Redis {
    return this.client;
  }

  /**
   * Helper: Get from cache or fetch from source
   */
  public async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds = 3600,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached) {
      return cached;
    }

    const value = await fetcher();

    // Only cache if value is not null/undefined
    if (value !== null && value !== undefined) {
      await this.set(key, value, ttlSeconds);
    }

    return value;
  }

  /**
   * Safe set method
   */
  public async set(
    key: string,
    value: any,
    ttlSeconds?: number,
  ): Promise<void> {
    if (!this.isEnabled || !this.client) return;
    try {
      const stringValue = JSON.stringify(value);
      await (ttlSeconds
        ? this.client.setex(key, ttlSeconds, stringValue)
        : this.client.set(key, stringValue));
    } catch (error) {
      logger.error({ err: error, key }, 'Redis set error');
    }
  }
}

export const redis = RedisManager.getInstance();
