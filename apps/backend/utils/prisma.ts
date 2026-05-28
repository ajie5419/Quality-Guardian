import process from 'node:process';

import pkg from '@prisma/client';

const { PrismaClient } = pkg;

// Create a singleton instance of PrismaClient
const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient>;
};

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.PRISMA_LOG_ERROR === '1' ? ['error', 'warn'] : ['warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
