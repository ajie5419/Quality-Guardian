import type { Prisma, PrismaClient } from '@prisma/client';

import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';

const logger = createModuleLogger('request-idempotency');

/**
 * Minimal request-level idempotency utility (IDEMPOTENCY-KEY-001).
 *
 * Claim model:
 *   - The PROCESSING claim row and the business write are committed in the
 *     SAME transaction: business rollback rolls the claim back, so a failed
 *     create never leaves a permanent key tombstone.
 *   - A concurrent duplicate claim loses the unique-key race (MySQL blocks
 *     the second INSERT until the winner commits, then reports P2002). The
 *     loser never starts a second business create; it replays the winner's
 *     COMPLETED result or fails with a conflict.
 *   - Only a P2002 raised by the claim unique key is treated as a duplicate
 *     claim. A P2002 raised by the business write (requestNo / serialNumber /
 *     NC-number conflicts) is rethrown so module-level retry wrappers can
 *     restart the whole claim+business transaction.
 *   - Logical expiry (PHASE-2): a settled claim whose expiresAt has passed is
 *     atomically reclaimed (CAS updateMany on the expired row) and becomes a
 *     brand-new request. Two concurrent reclaims race on the same row and
 *     exactly one becomes the new owner; the loser resolves the winner's
 *     fresh claim (IN_PROGRESS or replay).
 *   - Replay re-checks the current security boundary via `resourceGuard`
 *     before returning the stored response; it never bypasses auth.
 *
 * The utility only owns claim/fingerprint/replay; business permissions,
 * transactions and state machines stay in the domain service.
 */

export interface RequestIdempotencyRunResult<T> {
  resourceType: string;
  resourceId: string;
  response: T;
}

export interface RequestIdempotencyOptions<T> {
  prisma: PrismaClient;
  actorKey: string;
  operationKey: string;
  idempotencyKey: string;
  requestFingerprint: string;
  expiresAt: Date;
  run: (
    tx: Prisma.TransactionClient,
  ) => Promise<RequestIdempotencyRunResult<T>>;
  /** Optional current-security re-check before a replay response is returned. */
  resourceGuard?: (
    client: PrismaClient,
    resourceId: string,
  ) => Promise<boolean>;
}

export interface RequestIdempotencyOutcome<T> {
  replayed: boolean;
  resourceType: string;
  resourceId: string;
  response: T;
  responseStatus: number;
}

export class IdempotencyKeyReusedError extends BusinessError {
  constructor() {
    super(
      'IDEMPOTENCY_KEY_REUSED',
      '同一幂等键已被不同请求内容使用，请重新发起创建',
      409,
    );
  }
}

export class IdempotencyRequestInProgressError extends BusinessError {
  constructor() {
    super(
      'IDEMPOTENCY_REQUEST_IN_PROGRESS',
      '该请求正在处理中，请稍后重试',
      409,
    );
  }
}

const DEFAULT_RESPONSE_STATUS = 200;
const MAX_CLAIM_RECURSION_DEPTH = 3;

export async function withRequestIdempotency<T>(
  options: RequestIdempotencyOptions<T>,
): Promise<RequestIdempotencyOutcome<T>> {
  return claimAndRun(options, 0);
}

async function claimAndRun<T>(
  options: RequestIdempotencyOptions<T>,
  depth: number,
): Promise<RequestIdempotencyOutcome<T>> {
  try {
    return await options.prisma.$transaction(async (tx) => {
      await tx.idempotency_requests.create({
        data: {
          actorKey: options.actorKey,
          expiresAt: options.expiresAt,
          idempotencyKey: options.idempotencyKey,
          operationKey: options.operationKey,
          requestFingerprint: options.requestFingerprint,
        },
      });
      const result = await options.run(tx);
      await tx.idempotency_requests.updateMany({
        data: {
          completedAt: new Date(),
          resourceId: result.resourceId,
          resourceType: result.resourceType,
          responseBody: result.response as Prisma.InputJsonValue,
          responseStatus: DEFAULT_RESPONSE_STATUS,
          status: 'COMPLETED',
        },
        where: {
          actorKey: options.actorKey,
          idempotencyKey: options.idempotencyKey,
          operationKey: options.operationKey,
          status: 'PROCESSING',
        },
      });
      return {
        replayed: false,
        resourceId: result.resourceId,
        resourceType: result.resourceType,
        response: result.response,
        responseStatus: DEFAULT_RESPONSE_STATUS,
      };
    });
  } catch (error) {
    // A duplicate claim aborts the whole transaction with P2002 on the claim
    // unique key. Any other P2002 (business serial/requestNo conflicts) must
    // bubble up so module-level retry wrappers can restart the transaction.
    if (isClaimUniqueConflict(error)) {
      return resolveExistingClaim(options, depth);
    }
    logger.error(
      {
        err: error,
        actorKey: options.actorKey,
        operationKey: options.operationKey,
      },
      'idempotency claim transaction failed',
    );
    throw error;
  }
}

interface SettledClaim {
  expiresAt: Date;
  requestFingerprint: string;
  resourceId: null | string;
  resourceType: null | string;
  responseBody: null | unknown;
  responseStatus: null | number;
  status: 'COMPLETED' | 'PROCESSING';
}

async function resolveExistingClaim<T>(
  options: RequestIdempotencyOptions<T>,
  depth: number,
): Promise<RequestIdempotencyOutcome<T>> {
  const claimWhere = {
    actorKey: options.actorKey,
    idempotencyKey: options.idempotencyKey,
    operationKey: options.operationKey,
  };
  const existing = await options.prisma.idempotency_requests.findUnique({
    where: {
      actorKey_operationKey_idempotencyKey: claimWhere,
    },
  });
  if (!existing) {
    // The winner's transaction rolled back after our failed insert, so the
    // key is free again; claim it once more.
    if (depth >= MAX_CLAIM_RECURSION_DEPTH) {
      throw new IdempotencyRequestInProgressError();
    }
    return claimAndRun(options, depth + 1);
  }
  if (existing.expiresAt.getTime() <= Date.now()) {
    return reclaimExpiredClaim(options, depth);
  }
  if (existing.requestFingerprint !== options.requestFingerprint) {
    throw new IdempotencyKeyReusedError();
  }
  if (existing.status === 'PROCESSING') {
    throw new IdempotencyRequestInProgressError();
  }
  return resolveSettledReplay(options, existing);
}

/**
 * Atomic logical expiry: the expired row is CAS-reclaimed (only a row whose
 * expiresAt is still in the past can be taken over), then the business create
 * runs again in the same transaction. A competing reclaim loses the CAS
 * (count = 0) and resolves the winner's fresh claim instead of double-running
 * the create.
 */
async function reclaimExpiredClaim<T>(
  options: RequestIdempotencyOptions<T>,
  depth: number,
): Promise<RequestIdempotencyOutcome<T>> {
  const claimWhere = {
    actorKey: options.actorKey,
    idempotencyKey: options.idempotencyKey,
    operationKey: options.operationKey,
  };
  try {
    return await options.prisma.$transaction(async (tx) => {
      const reclaimed = await tx.idempotency_requests.updateMany({
        data: {
          completedAt: null,
          expiresAt: options.expiresAt,
          requestFingerprint: options.requestFingerprint,
          resourceId: null,
          resourceType: null,
          responseBody: null,
          responseStatus: null,
          status: 'PROCESSING',
        },
        where: {
          ...claimWhere,
          expiresAt: { lte: new Date() },
          status: { in: ['PROCESSING', 'COMPLETED'] },
        },
      });
      if (reclaimed.count !== 1) {
        // Another instance won the reclaim; resolve its fresh claim.
        const fresh = await tx.idempotency_requests.findUnique({
          where: {
            actorKey_operationKey_idempotencyKey: claimWhere,
          },
        });
        if (!fresh) {
          if (depth >= MAX_CLAIM_RECURSION_DEPTH) {
            throw new IdempotencyRequestInProgressError();
          }
          return claimAndRun(options, depth + 1);
        }
        return resolveFreshClaim(options, fresh);
      }
      const result = await options.run(tx);
      await tx.idempotency_requests.updateMany({
        data: {
          completedAt: new Date(),
          resourceId: result.resourceId,
          resourceType: result.resourceType,
          responseBody: result.response as Prisma.InputJsonValue,
          responseStatus: DEFAULT_RESPONSE_STATUS,
          status: 'COMPLETED',
        },
        where: {
          ...claimWhere,
          status: 'PROCESSING',
        },
      });
      return {
        replayed: false,
        resourceId: result.resourceId,
        resourceType: result.resourceType,
        response: result.response,
        responseStatus: DEFAULT_RESPONSE_STATUS,
      };
    });
  } catch (error) {
    if (isClaimUniqueConflict(error)) {
      // The reclaim raced with another claim on the same row; re-resolve.
      return resolveExistingClaim(options, depth + 1);
    }
    logger.error(
      {
        err: error,
        actorKey: options.actorKey,
        operationKey: options.operationKey,
      },
      'idempotency expired-claim reclaim failed',
    );
    throw error;
  }
}

function resolveFreshClaim<T>(
  options: RequestIdempotencyOptions<T>,
  fresh: SettledClaim,
): Promise<RequestIdempotencyOutcome<T>> {
  if (fresh.status === 'PROCESSING') {
    throw new IdempotencyRequestInProgressError();
  }
  if (fresh.requestFingerprint !== options.requestFingerprint) {
    throw new IdempotencyKeyReusedError();
  }
  return resolveSettledReplay(options, fresh);
}

async function resolveSettledReplay<T>(
  options: RequestIdempotencyOptions<T>,
  existing: SettledClaim,
): Promise<RequestIdempotencyOutcome<T>> {
  if (
    options.resourceGuard &&
    !(await options.resourceGuard(options.prisma, existing.resourceId ?? ''))
  ) {
    throw new BusinessError('NOT_FOUND', '资源不可访问或已删除', 404);
  }
  return {
    replayed: true,
    resourceId: existing.resourceId ?? '',
    resourceType: existing.resourceType ?? '',
    response: (existing.responseBody ?? null) as T,
    responseStatus: existing.responseStatus ?? DEFAULT_RESPONSE_STATUS,
  };
}

/**
 * A P2002 counts as a duplicate claim only when it points at the claim unique
 * key. Prisma reports the violating fields in `meta.target`, which for MySQL
 * is the compound unique column list of idempotency_requests.
 */
function isClaimUniqueConflict(error: unknown): boolean {
  if (!isPrismaUniqueConstraintError(error)) return false;
  const target: unknown = (error as { meta?: { target?: unknown } })?.meta
    ?.target;
  const targetText = Array.isArray(target)
    ? target.map(String).join(',')
    : String(target ?? '');
  return (
    targetText.includes('idempotencyKey') ||
    targetText.includes('actorKey') ||
    targetText.toLowerCase().includes('idempotency')
  );
}
