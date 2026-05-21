import type { Prisma } from '@prisma/client';

import prisma from '~/utils/prisma';

type CacheEntry = {
  expiresAt: number;
  processId: null | string;
};

const PROCESS_ID_CACHE_TTL_MS = 5 * 60 * 1000;
const processIdCache = new Map<string, CacheEntry>();

function normalizeProcessName(processName: unknown) {
  return String(processName || '').trim();
}

export function resolveCanonicalProcessName(record?: {
  process?: null | { name?: null | string };
  processName?: null | string;
}) {
  const relationName = normalizeProcessName(record?.process?.name);
  if (relationName) {
    return relationName;
  }
  const fallbackName = normalizeProcessName(record?.processName);
  return fallbackName || null;
}

export async function resolveCanonicalProcessNameById(
  tx: {
    processes: {
      findFirst(args: {
        select: { name: true };
        where: { id: string; isDeleted: boolean };
      }): Promise<null | { name: null | string }>;
    };
  },
  processId?: null | string,
  processName?: null | string,
) {
  const normalizedProcessId = String(processId || '').trim();
  if (!normalizedProcessId) {
    const fallbackName = normalizeProcessName(processName);
    return fallbackName || null;
  }
  const process = await tx.processes.findFirst({
    where: {
      id: normalizedProcessId,
      isDeleted: false,
    },
    select: {
      name: true,
    },
  });
  const canonicalName = normalizeProcessName(process?.name);
  if (canonicalName) {
    return canonicalName;
  }
  const fallbackName = normalizeProcessName(processName);
  return fallbackName || null;
}

export async function resolveProcessId(
  processName: string,
): Promise<null | string> {
  const normalizedName = normalizeProcessName(processName);
  if (!normalizedName) {
    return null;
  }

  const now = Date.now();
  const cached = processIdCache.get(normalizedName);
  if (cached && cached.expiresAt > now) {
    return cached.processId;
  }

  const processItem = await prisma.processes.findFirst({
    where: {
      isDeleted: false,
      name: normalizedName,
    },
    select: { id: true },
  });

  const processId = processItem?.id || null;
  processIdCache.set(normalizedName, {
    processId,
    expiresAt: now + PROCESS_ID_CACHE_TTL_MS,
  });
  return processId;
}

export async function buildProcessNameWhere(
  processName: string,
  options?: {
    field?: string;
  },
): Promise<Prisma.quality_recordsWhereInput> {
  const normalizedProcessName = normalizeProcessName(processName);
  if (!normalizedProcessName) {
    return {};
  }
  const field = String(options?.field || 'processName').trim() || 'processName';
  const resolvedProcessId = await resolveProcessId(normalizedProcessName);
  const fieldCondition = {
    [field]: normalizedProcessName,
  } as Prisma.quality_recordsWhereInput;
  if (!resolvedProcessId) {
    return fieldCondition;
  }
  return {
    OR: [fieldCondition, { processId: resolvedProcessId }],
  };
}
