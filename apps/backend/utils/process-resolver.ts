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
