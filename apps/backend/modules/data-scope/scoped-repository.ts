import type { Prisma } from '@prisma/client';

import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

import { DataScopeService } from './data-scope.service';

/**
 * Resolved data scope carried from the request layer. Fields are optional at
 * the transport boundary on purpose: an incomplete scope (missing scopeType)
 * fails closed inside DataScopeService.buildScopedWhere and never degrades to
 * full access.
 */
export type AccessScope = {
  deptIds?: string[];
  scopeType?: 'ALL' | 'DEPT' | 'SELF';
};

export interface ScopedAccessContext {
  scope?: AccessScope;
  user: {
    id: number | string;
    username?: string;
  };
}

const _SCOPED_DELEGATES = {
  after_sales: prisma.after_sales,
  inspections: prisma.inspections,
  qms_inspection_requests: prisma.qms_inspection_requests,
  quality_losses: prisma.quality_losses,
  quality_loss_index: prisma.quality_loss_index,
  qms_task_dispatches: prisma.qms_task_dispatches,
  suppliers: prisma.suppliers,
  work_orders: prisma.work_orders,
} as const;

export type ScopedModelName = keyof typeof _SCOPED_DELEGATES;

/**
 * Structural gate for Prisma delegates. Signatures intentionally use `any`:
 * the exact argument and result types are re-derived per operation from the
 * concrete delegate via Prisma.Args / Prisma.Result, so this shape only
 * asserts that the delegate supports the forwarded operations. The `any`
 * return types are an internal bridge: without them TypeScript refuses the
 * result cast for deferred generics, and the public factory surface stays
 * fully typed.
 */
interface ScopedDelegateShape {
  count: (...args: any[]) => Promise<number>;
  deleteMany: (...args: any[]) => Promise<{ count: number }>;
  findFirst: (...args: any[]) => Promise<any>;
  findMany: (...args: any[]) => Promise<any[]>;
  updateMany: (...args: any[]) => Promise<{ count: number }>;
}

/**
 * Operations only used by aggregate/groupBy. Kept out of ScopedDelegateShape
 * on purpose: gating on them forces TypeScript to instantiate the delegate's
 * generic aggregate method against Prisma's recursive
 * ScalarWhereWithAggregatesInput types and raises TS2615 circular-reference
 * errors at every factory call site.
 */
interface ScopedAggregateShape {
  aggregate: (...args: any[]) => Promise<unknown>;
  groupBy: (...args: any[]) => Promise<unknown[]>;
}

/**
 * Generic row-level authorization layer. Every access to a protected model
 * must go through one of these methods so that the resolved DataScope is
 * always merged into the where clause. Scope resolution anomalies fail
 * closed (see DataScopeService.buildScopedWhere).
 */
export function createScopedRepository<D extends ScopedDelegateShape>(
  module: string,
  delegate: D,
) {
  // The plain model WhereInput (no ScalarWhereWithAggregatesInput machinery)
  // is the only where shape the scope merge needs. Deriving it from
  // updateMany keeps the factory generic-safe.
  type WhereInput = NonNullable<Prisma.Args<D, 'updateMany'>['where']>;

  const toUserContext = (ctx: ScopedAccessContext) => ({
    userId: String(ctx.user.id),
    username: ctx.user.username,
  });

  /**
   * Bridges the internal `any`-typed delegate result to the concrete Prisma
   * payload type. A plain `as` cast is rejected by TypeScript inside the
   * generic factory body (deferred conditional types do not overlap), while
   * double assertions are forbidden by project constraints.
   */
  const toResult = <T>(value: Promise<any>): Promise<T> => value;

  /**
   * Merges the resolved scope into the base where. An absent base where is
   * still scoped: callers can never widen a query to full access by omitting
   * the where clause.
   */
  async function scopedWhere<W extends WhereInput>(
    where: W,
    ctx: ScopedAccessContext,
  ): Promise<W> {
    return DataScopeService.buildScopedWhere<W>(
      module,
      where,
      toUserContext(ctx),
      ctx.scope,
    );
  }

  const findAccessible = async (
    args: Prisma.Args<D, 'findFirst'>,
    ctx: ScopedAccessContext,
  ) => {
    const baseWhere = (args.where ?? {}) as WhereInput;
    const where = await scopedWhere(baseWhere, ctx);
    return toResult<Prisma.Result<D, Prisma.Args<D, 'findFirst'>, 'findFirst'>>(
      delegate.findFirst({ ...args, where }),
    );
  };

  const findManyAccessible = async (
    args: Prisma.Args<D, 'findMany'>,
    ctx: ScopedAccessContext,
  ) => {
    const baseWhere = (args.where ?? {}) as WhereInput;
    const where = await scopedWhere(baseWhere, ctx);
    return toResult<Prisma.Result<D, Prisma.Args<D, 'findMany'>, 'findMany'>>(
      delegate.findMany({ ...args, where }),
    );
  };

  const countAccessible = async (
    args: Prisma.Args<D, 'count'>,
    ctx: ScopedAccessContext,
  ) => {
    const baseWhere = (args.where ?? {}) as WhereInput;
    const where = await scopedWhere(baseWhere, ctx);
    return delegate.count({ ...args, where });
  };

  /**
   * Aggregate over the caller's data scope. The where clause is fully typed
   * with the model WhereInput; the remaining aggregate options (select/_sum/
   * _count/orderBy) are passed through untyped. Instantiating
   * Prisma.Args<D, 'aggregate'> inside a generic factory triggers TS2615
   * circular references on ScalarWhereWithAggregatesInput, so the exact
   * aggregate result type is intentionally left as unknown until a concrete
   * caller needs it (then it can be narrowed with a model-specific wrapper).
   */
  const aggregateAccessible = async (
    args: Record<string, unknown> & { where?: WhereInput },
    ctx: ScopedAccessContext,
  ): Promise<unknown> => {
    const baseWhere = (args.where ?? {}) as WhereInput;
    const where = await scopedWhere(baseWhere, ctx);
    return (delegate as D & ScopedAggregateShape).aggregate({ ...args, where });
  };

  const groupByAccessible = async (
    args: Record<string, unknown> & { where?: WhereInput },
    ctx: ScopedAccessContext,
  ): Promise<unknown[]> => {
    const baseWhere = (args.where ?? {}) as WhereInput;
    const where = await scopedWhere(baseWhere, ctx);
    return (delegate as D & ScopedAggregateShape).groupBy({ ...args, where });
  };

  const updateAccessible = async (
    args: Prisma.Args<D, 'updateMany'>,
    ctx: ScopedAccessContext,
  ) => {
    const baseWhere = (args.where ?? {}) as WhereInput;
    const where = await scopedWhere(baseWhere, ctx);
    return delegate.updateMany({ ...args, where });
  };

  /**
   * Optimistic-lock scoped update (OPTIMISTIC-LOCK-001). The caller's
   * expectedVersion is merged into the where clause and the row version is
   * incremented atomically, so two editors can never silently overwrite each
   * other: exactly one of them wins (count === 1). The caller must classify a
   * count === 0 result with assertVersionedWriteAffected after a read-only
   * scoped existence check (404 vs 409), never by re-reading and re-writing.
   */
  const updateAccessibleVersioned = async (
    args: Prisma.Args<D, 'updateMany'>,
    ctx: ScopedAccessContext,
    expectedVersion: number,
  ) => {
    const baseWhere = (args.where ?? {}) as WhereInput;
    const where = await scopedWhere(
      { ...baseWhere, version: expectedVersion },
      ctx,
    );
    // The caller's data must never forge the version column; only the atomic
    // increment may touch it.
    const data = {
      ...(args.data as object),
      version: { increment: 1 },
    };
    return delegate.updateMany({ ...args, where, data });
  };

  const deleteAccessible = async (
    args: Prisma.Args<D, 'deleteMany'>,
    ctx: ScopedAccessContext,
  ) => {
    const baseWhere = (args.where ?? {}) as WhereInput;
    const where = await scopedWhere(baseWhere, ctx);
    return delegate.deleteMany({ ...args, where });
  };

  return {
    aggregateAccessible,
    countAccessible,
    deleteAccessible,
    exportAccessible: findManyAccessible,
    findAccessible,
    findManyAccessible,
    groupByAccessible,
    module,
    updateAccessible,
    updateAccessibleVersioned,
  };
}

/**
 * Single-record mutations must affect exactly one row. A count of zero means
 * the target does not exist or is outside the caller's data scope; report it
 * as not-found so callers never learn about records they cannot see.
 */
export function assertScopedWriteAffected(count: number, label: string) {
  if (count !== 1) {
    throw new BusinessError(
      'NOT_FOUND',
      `${label}不存在或不在你的数据权限范围内`,
      404,
    );
  }
}

/**
 * Classifies a failed versioned write (count === 0). A scoped existence check
 * must have already run: absent/out-of-scope reports 404 (never leaking the
 * object's existence), while an existing row with a stale version reports 409
 * so the client refreshes instead of overwriting a newer edit.
 */
export function assertVersionedWriteAffected(
  count: number,
  exists: boolean,
  label: string,
) {
  if (count === 1) return;
  if (!exists) {
    throw new BusinessError(
      'NOT_FOUND',
      `${label}不存在或不在你的数据权限范围内`,
      404,
    );
  }
  throw new BusinessError(
    'OPTIMISTIC_LOCK_CONFLICT',
    '记录已被其他用户修改，请刷新后重试',
    409,
  );
}
