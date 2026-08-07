import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

/**
 * Close Prisma and Redis so one-shot maintenance scripts exit promptly.
 * Redis may only be opened transitively by a dependency (projection
 * publication, refresh queues), so every maintenance entry closes it.
 */
export async function closeConnections(): Promise<void> {
  await prisma.$disconnect();
  redis.disconnect();
}
