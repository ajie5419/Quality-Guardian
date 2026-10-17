import type { UpdatedAtCursor } from '~/utils/query-helpers';

import type {
  FulfillmentSyncQuery,
  FulfillmentSyncResource,
} from './fulfillment-sync.schema';

import { users_status } from '@prisma/client';
import { DeptService } from '~/modules/dept';
import { InspectionRequestSyncService } from '~/modules/inspection';
import { ProcessMasterService } from '~/modules/process-master';
import { SupplierService } from '~/modules/supplier';
import { TeamIdentityService } from '~/modules/team';
import { UserService } from '~/modules/user';
import { WorkOrderService } from '~/modules/work-order';

export interface FulfillmentSyncCursor {
  afterId: string;
  since: string;
}

export interface FulfillmentSyncPage<T> {
  items: T[];
  nextCursor: FulfillmentSyncCursor | null;
}

export const SUPPLIER_KIND = { SUPPLIER: 'SUPPLIER', TEAM: 'TEAM' } as const;
const TEAM_ACTIVE_STATUS = 1;
const TEAM_STATUS_LABEL = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' } as const;

interface SyncRequest {
  cursor: undefined | UpdatedAtCursor;
  limit: number;
}

const iso = (value: Date) => value.toISOString();
const isoOrNull = (value: Date | null) => (value ? value.toISOString() : null);

function toSyncRequest(query: FulfillmentSyncQuery): SyncRequest {
  return {
    cursor: query.since
      ? { afterKey: query.afterId, since: new Date(query.since) }
      : undefined,
    limit: query.limit,
  };
}

/**
 * A full page means more rows may follow, so the cursor points at the last
 * row's `(updatedAt, key)`; a short page means the consumer has caught up.
 */
export function buildSyncPage<T extends { updatedAt: string }>(
  items: T[],
  limit: number,
  keyOf: (item: T) => string,
): FulfillmentSyncPage<T> {
  const last = items.at(-1);
  if (!last || items.length < limit) return { items, nextCursor: null };
  return { items, nextCursor: { afterId: keyOf(last), since: last.updatedAt } };
}

function compareSyncOrder(
  left: { id: string; updatedAt: string },
  right: { id: string; updatedAt: string },
) {
  const byTime = Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
  if (byTime !== 0) return byTime;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

async function listWorkOrders({ cursor, limit }: SyncRequest) {
  const rows = await WorkOrderService.listSyncPage(cursor, limit);
  const items = rows.map((row) => ({
    customerName: row.customerName,
    deliveryDate: iso(row.deliveryDate),
    isDeleted: row.isDeleted,
    projectName: row.projectName,
    quantity: row.quantity,
    status: row.status,
    updatedAt: iso(row.updatedAt),
    workOrderNumber: row.workOrderNumber,
  }));
  return buildSyncPage(items, limit, (item) => item.workOrderNumber);
}

/**
 * Suppliers and TEAM rows share one `(updatedAt, id)` stream: each source is
 * fetched with the same cursor and `take(limit)` in the database, and only
 * the at most `2 * limit` candidates are merged here.
 */
async function listSuppliers({ cursor, limit }: SyncRequest) {
  const [suppliers, teams] = await Promise.all([
    SupplierService.listSyncPage(cursor, limit),
    TeamIdentityService.listSyncPage(cursor, limit),
  ]);
  const items = [
    ...suppliers.map((row) => ({
      category: row.category,
      id: row.id,
      isDeleted: row.isDeleted,
      kind: SUPPLIER_KIND.SUPPLIER,
      name: row.name,
      outsourcingMode: row.outsourcingMode,
      status: row.status,
      updatedAt: iso(row.updatedAt),
    })),
    ...teams.map((row) => ({
      category: null,
      id: row.id,
      isDeleted: row.isDeleted,
      kind: SUPPLIER_KIND.TEAM,
      name: row.dictValue,
      outsourcingMode: null,
      status:
        row.status === TEAM_ACTIVE_STATUS
          ? TEAM_STATUS_LABEL.ACTIVE
          : TEAM_STATUS_LABEL.INACTIVE,
      updatedAt: iso(row.updatedAt),
    })),
  ]
    .sort(compareSyncOrder)
    .slice(0, limit);
  return buildSyncPage(items, limit, (item) => item.id);
}

async function listProcesses({ cursor, limit }: SyncRequest) {
  const rows = await ProcessMasterService.listSyncPage(cursor, limit);
  const items = rows.map((row) => ({ ...row, updatedAt: iso(row.updatedAt) }));
  return buildSyncPage(items, limit, (item) => item.id);
}

async function listDepartments({ cursor, limit }: SyncRequest) {
  const rows = await DeptService.listSyncPage(cursor, limit);
  const items = rows.map((row) => ({ ...row, updatedAt: iso(row.updatedAt) }));
  return buildSyncPage(items, limit, (item) => item.id);
}

async function listUsers({ cursor, limit }: SyncRequest) {
  const rows = await UserService.listSyncPage(cursor, limit);
  const items = rows.map((row) => ({
    // users.department stores departments.id, not a display name.
    departmentId: row.department || null,
    id: row.id,
    isActive: row.status === users_status.ACTIVE,
    isDeleted: row.isDeleted,
    realName: row.realName,
    updatedAt: iso(row.updatedAt),
    username: row.username,
  }));
  return buildSyncPage(items, limit, (item) => item.id);
}

async function listInspections({ cursor, limit }: SyncRequest) {
  const rows = await InspectionRequestSyncService.listSyncPage(cursor, limit);
  const items = rows.map(({ closedAt, submittedAt, team, ...row }) => ({
    ...row,
    closedAt: isoOrNull(closedAt),
    submittedAt: iso(submittedAt),
    teamName: team,
    updatedAt: iso(row.updatedAt),
  }));
  return buildSyncPage(items, limit, (item) => item.id);
}

const LOADERS = {
  departments: listDepartments,
  inspections: listInspections,
  processes: listProcesses,
  suppliers: listSuppliers,
  users: listUsers,
  'work-orders': listWorkOrders,
} satisfies Record<FulfillmentSyncResource, (request: SyncRequest) => unknown>;

export const FulfillmentSyncService = {
  async list(resource: FulfillmentSyncResource, query: FulfillmentSyncQuery) {
    return LOADERS[resource](toSyncRequest(query));
  },
};
