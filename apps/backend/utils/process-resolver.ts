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
  const resolvedMap = await resolveProcessIdsByNames([normalizedName]);
  return resolvedMap.get(normalizedName) ?? null;
}

export async function resolveProcessIdsByNames(
  processNames: Array<null | string | undefined>,
) {
  const normalizedNames = [
    ...new Set(
      processNames.map((item) => normalizeProcessName(item)).filter(Boolean),
    ),
  ];
  const resolvedMap = new Map<string, null | string>();
  if (normalizedNames.length === 0) {
    return resolvedMap;
  }

  const now = Date.now();
  const pendingNames: string[] = [];
  for (const processName of normalizedNames) {
    const cached = processIdCache.get(processName);
    if (cached && cached.expiresAt > now) {
      resolvedMap.set(processName, cached.processId);
      continue;
    }
    pendingNames.push(processName);
  }

  if (pendingNames.length > 0) {
    const processRows = await prisma.processes.findMany({
      where: {
        isDeleted: false,
        name: {
          in: pendingNames,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });
    const processIdByName = new Map(
      processRows.map((item) => [normalizeProcessName(item.name), item.id]),
    );
    for (const processName of pendingNames) {
      const processId = processIdByName.get(processName) || null;
      processIdCache.set(processName, {
        processId,
        expiresAt: now + PROCESS_ID_CACHE_TTL_MS,
      });
      resolvedMap.set(processName, processId);
    }
  }

  return resolvedMap;
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

export async function resolveProcessIdForWrite(options: {
  explicitProcessId?: null | string;
  fallbackProcessId?: null | string;
  keepExistingWhenNameMissing?: boolean;
  processName?: null | string;
}): Promise<null | string | undefined> {
  const explicitProcessId = options.explicitProcessId;
  if (explicitProcessId !== undefined) {
    return explicitProcessId;
  }
  const normalizedProcessName = normalizeProcessName(options.processName);
  if (!normalizedProcessName) {
    if (options.keepExistingWhenNameMissing) {
      return undefined;
    }
    return options.fallbackProcessId ?? null;
  }
  return resolveProcessId(normalizedProcessName);
}
