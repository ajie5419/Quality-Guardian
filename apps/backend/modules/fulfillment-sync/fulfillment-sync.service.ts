import type { WorkOrderBomRow } from '~/modules/planning';
import type { UpdatedAtCursor } from '~/utils/query-helpers';

import type {
  FulfillmentSyncQuery,
  FulfillmentSyncResource,
} from './fulfillment-sync.schema';

import { users_status } from '@prisma/client';
import { parseBomRequiredProcesses } from '@qgs/shared';
import { DeptService } from '~/modules/dept';
import { InspectionRequestSyncService } from '~/modules/inspection';
import { PlanningBomService } from '~/modules/planning';
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

// Kept on supplier rows for contract compatibility; TEAM rows have their own feed.
const SUPPLIER_KIND = 'SUPPLIER' as const;
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
 * Each feed reads exactly one table so MySQL alone defines the
 * `(updatedAt, id)` order; ids from different tables are never compared in
 * JS, because the column collation orders them differently from JS strings.
 */
async function listSuppliers({ cursor, limit }: SyncRequest) {
  const rows = await SupplierService.listSyncPage(cursor, limit);
  const items = rows.map((row) => ({
    category: row.category,
    id: row.id,
    isDeleted: row.isDeleted,
    kind: SUPPLIER_KIND,
    name: row.name,
    outsourcingMode: row.outsourcingMode,
    status: row.status,
    updatedAt: iso(row.updatedAt),
  }));
  return buildSyncPage(items, limit, (item) => item.id);
}

async function listTeams({ cursor, limit }: SyncRequest) {
  const rows = await TeamIdentityService.listSyncPage(cursor, limit);
  const items = rows.map((row) => ({
    id: row.id,
    isDeleted: row.isDeleted,
    name: row.dictValue,
    status:
      row.status === TEAM_ACTIVE_STATUS
        ? TEAM_STATUS_LABEL.ACTIVE
        : TEAM_STATUS_LABEL.INACTIVE,
    updatedAt: iso(row.updatedAt),
  }));
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
  teams: listTeams,
  users: listUsers,
  'work-orders': listWorkOrders,
} satisfies Record<FulfillmentSyncResource, (request: SyncRequest) => unknown>;

export interface FulfillmentBomProcess {
  position: number;
  processId: null | string;
  processName: string;
}

/**
 * Required processes in position order. processName prefers the live process
 * master name over the snapshot. Rows that predate process identities only
 * carry the legacy text snapshot; those are returned without a processId.
 */
function bomProcesses(row: WorkOrderBomRow): FulfillmentBomProcess[] {
  if (row.processRequirements.length > 0) {
    return row.processRequirements.map((item, index) => ({
      position: index,
      processId: item.processId || null,
      processName: item.process?.name || item.processName,
    }));
  }
  return parseBomRequiredProcesses(row.required_processes).map(
    (processName, position) => ({ position, processId: null, processName }),
  );
}

function toBomItem(row: WorkOrderBomRow) {
  return {
    id: row.id,
    material: row.material,
    partId: row.partId,
    partName: row.part_name,
    partNumber: row.part_number,
    processes: bomProcesses(row),
    quantity: row.quantity,
    remarks: row.remarks,
    unit: row.unit,
    updatedAt: iso(row.updated_at),
  };
}

export type FulfillmentBomItem = ReturnType<typeof toBomItem>;

export const FulfillmentSyncService = {
  async list(resource: FulfillmentSyncResource, query: FulfillmentSyncQuery) {
    return LOADERS[resource](toSyncRequest(query));
  },

  /**
   * On-demand BOM read for one work order (not a cursor feed: BOM rows are
   * hard-deleted and child process rows do not bump the parent updated_at).
   */
  async listWorkOrderBom(workOrderNumber: string) {
    const rows = await PlanningBomService.listByWorkOrder(workOrderNumber);
    return { items: rows.map((row) => toBomItem(row)), workOrderNumber };
  },
};
