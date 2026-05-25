import type { Prisma } from '@prisma/client';

import process from 'node:process';

import { MasterDataGovernanceKernel } from '~/core/master-data/governance-kernel';
import { createModuleLogger } from '~/utils/logger';

type CacheEntry = {
  expiresAt: number;
  processId: null | string;
};

const PROCESS_ID_CACHE_TTL_MS = 5 * 60 * 1000;
const PROCESS_GOVERNANCE_FAILOVER_ENABLED =
  process.env.PROCESS_GOVERNANCE_FAILOVER_ENABLED !== 'false';
const PROCESS_GOVERNANCE_FAILOVER_COOLDOWN_MS = Math.max(
  1000,
  Number(process.env.PROCESS_GOVERNANCE_FAILOVER_COOLDOWN_MS || 30_000),
);
const processIdCache = new Map<string, CacheEntry>();
const logger = createModuleLogger('ProcessResolver');
let processGovernanceFailoverUntil = 0;

function normalizeProcessName(processName: unknown) {
  return String(processName || '').trim();
}

function shouldBypassGovernanceLookup() {
  if (!PROCESS_GOVERNANCE_FAILOVER_ENABLED) {
    return false;
  }
  return Date.now() < processGovernanceFailoverUntil;
}

function markGovernanceLookupFailure(error: unknown, operation: string) {
  if (!PROCESS_GOVERNANCE_FAILOVER_ENABLED) {
    return;
  }
  processGovernanceFailoverUntil =
    Date.now() + PROCESS_GOVERNANCE_FAILOVER_COOLDOWN_MS;
  logger.warn(
    {
      operation,
      cooldownMs: PROCESS_GOVERNANCE_FAILOVER_COOLDOWN_MS,
      error: error instanceof Error ? error.message : String(error),
      failoverUntil: processGovernanceFailoverUntil,
    },
    'master-data governance lookup failed, fallback mode enabled',
  );
}

function markGovernanceLookupSuccess() {
  if (!PROCESS_GOVERNANCE_FAILOVER_ENABLED) {
    return;
  }
  processGovernanceFailoverUntil = 0;
}

function resolveProcessIdForWriteFallback(options: {
  explicitProcessId?: null | string;
  fallbackProcessId?: null | string;
  keepExistingWhenNameMissing?: boolean;
  processName?: null | string;
}): null | string | undefined {
  if (options.explicitProcessId !== undefined) {
    return options.explicitProcessId;
  }
  const normalizedProcessName = normalizeProcessName(options.processName);
  if (!normalizedProcessName) {
    if (options.keepExistingWhenNameMissing) {
      return undefined;
    }
    return options.fallbackProcessId ?? null;
  }
  return options.fallbackProcessId ?? null;
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
  const normalizedProcessName = normalizeProcessName(processName);
  if (!normalizedProcessId) {
    return normalizedProcessName || null;
  }
  // Use current transaction first to preserve read-your-write semantics.
  const process = await tx.processes.findFirst({
    where: {
      id: normalizedProcessId,
      isDeleted: false,
    },
    select: {
      name: true,
    },
  });
  const txCanonicalName = normalizeProcessName(process?.name);
  if (txCanonicalName) {
    return txCanonicalName;
  }
  if (shouldBypassGovernanceLookup()) {
    return normalizedProcessName || null;
  }
  try {
    const canonicalName =
      await MasterDataGovernanceKernel.resolveCanonicalNameById({
        configKey: 'processName',
        canonicalId: normalizedProcessId,
        fallbackName: normalizedProcessName,
      });
    markGovernanceLookupSuccess();
    return canonicalName;
  } catch (error) {
    markGovernanceLookupFailure(error, 'resolveCanonicalProcessNameById');
    return normalizedProcessName || null;
  }
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
    let processIdByName = new Map<string, null | string>();
    if (!shouldBypassGovernanceLookup()) {
      try {
        processIdByName =
          await MasterDataGovernanceKernel.resolveCanonicalIdsByNames({
            configKey: 'processName',
            names: pendingNames,
          });
        markGovernanceLookupSuccess();
      } catch (error) {
        markGovernanceLookupFailure(error, 'resolveProcessIdsByNames');
        processIdByName = new Map<string, null | string>();
      }
    }
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
  const field = String(options?.field || '').trim() || 'processName';
  const normalizedName = normalizeProcessName(processName);
  if (!normalizedName) {
    return {};
  }
  if (shouldBypassGovernanceLookup()) {
    return {
      [field]: normalizedName,
    } as Prisma.quality_recordsWhereInput;
  }
  try {
    const where = (await MasterDataGovernanceKernel.buildNameWhere({
      configKey: 'processName',
      field: options?.field,
      name: normalizedName,
    })) as Prisma.quality_recordsWhereInput;
    markGovernanceLookupSuccess();
    return where;
  } catch (error) {
    markGovernanceLookupFailure(error, 'buildProcessNameWhere');
    return {
      [field]: normalizedName,
    } as Prisma.quality_recordsWhereInput;
  }
}

export async function resolveProcessIdForWrite(options: {
  explicitProcessId?: null | string;
  fallbackProcessId?: null | string;
  keepExistingWhenNameMissing?: boolean;
  processName?: null | string;
}): Promise<null | string | undefined> {
  if (shouldBypassGovernanceLookup()) {
    return resolveProcessIdForWriteFallback(options);
  }
  try {
    const processId =
      await MasterDataGovernanceKernel.resolveCanonicalIdForWrite({
        configKey: 'processName',
        explicitCanonicalId: options.explicitProcessId,
        fallbackCanonicalId: options.fallbackProcessId,
        keepExistingWhenNameMissing: options.keepExistingWhenNameMissing,
        name: options.processName,
      });
    markGovernanceLookupSuccess();
    return processId;
  } catch (error) {
    markGovernanceLookupFailure(error, 'resolveProcessIdForWrite');
    return resolveProcessIdForWriteFallback(options);
  }
}

export function __resetProcessResolverRuntimeForTest() {
  processIdCache.clear();
  processGovernanceFailoverUntil = 0;
}
