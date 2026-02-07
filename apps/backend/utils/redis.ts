import Redis from 'ioredis';
import { createModuleLogger } from './logger';

const logger = createModuleLogger('Redis');

class RedisManager {
    private static instance: RedisManager;
    private client: Redis | null = null;
    private isEnabled = false;

    private constructor() {
        const url = process.env.REDIS_URL;
        if (url) {
            this.client = new Redis(url, {
                maxRetriesPerRequest: 3,
                retryStrategy(times) {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                },
            });

            this.client.on('connect', () => {
                logger.info('Redis connected');
                this.isEnabled = true;
            });

            this.client.on('error', (err) => {
                logger.error({ err }, 'Redis connection error');
                this.isEnabled = false;
            });
        } else {
            logger.warn('REDIS_URL not found, caching disabled');
        }
    }

    public static getInstance(): RedisManager {
        if (!RedisManager.instance) {
            RedisManager.instance = new RedisManager();
        }
        return RedisManager.instance;
    }

    public getClient(): Redis | null {
        return this.client;
    }

    /**
     * Safe get method that swallows errors and returns null on failure
     */
    public async get<T>(key: string): Promise<T | null> {
        if (!this.isEnabled || !this.client) return null;
        try {
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error({ err: error, key }, 'Redis get error');
            return null;
        }
    }

    /**
     * Safe set method
     */
    public async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
        if (!this.isEnabled || !this.client) return;
        try {
            const stringValue = JSON.stringify(value);
            if (ttlSeconds) {
                await this.client.setex(key, ttlSeconds, stringValue);
            } else {
                await this.client.set(key, stringValue);
            }
        } catch (error) {
            logger.error({ err: error, key }, 'Redis set error');
        }
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
}

export const redis = RedisManager.getInstance();
