import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PartMasterService } from '~/modules/part-master';
import { RbacService } from '~/modules/rbac';
import { recordBusinessAuditLog } from '~/modules/system-log';
import prisma from '~/utils/prisma';

import {
  INSPECTION_MATERIAL_PERMISSION_CODES,
  InspectionMaterialRequestService,
} from './inspection-material-request.service';
import { publishInspectionRequestCreated } from './inspection-request-events';

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(),
    qms_inspection_material_requests: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('~/modules/part-master', () => ({
  PartMasterService: {
    assertActive: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('~/modules/rbac', () => ({
  RbacService: {
    getUserPermissionCodes: vi.fn(),
  },
}));

vi.mock('~/modules/system-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/modules/user', () => ({
  WxSubscribeMessageService: {
    sendPendingDispatchCreated: vi.fn(),
  },
}));

vi.mock('~/utils/telegram-bot', () => ({
  notifyTelegramNewRequest: vi.fn(),
}));

vi.mock('./inspection-request-events', () => ({
  publishInspectionRequestCreated: vi.fn(),
}));

vi.mock('./inspection-request', () => ({
  INSPECTION_REQUEST_STATUS: {
    CANCELLED: 'CANCELLED',
    SUBMITTED: 'SUBMITTED',
  },
  mapInspectionRequest: vi.fn().mockImplementation((value) => value),
  resolveInspectionRequestCurrentUserId: vi
    .fn()
    .mockResolvedValue('reviewer-1'),
}));

const event = {} as any;
const reviewer = {
  id: 'reviewer-1',
  roles: ['admin'],
  username: 'reviewer',
} as any;

function buildResolvedRequest() {
  return {
    dispatcher: null,
    id: 'request-1',
    inspector: null,
    materialRequest: {
      requestedName: 'New bearing',
      status: 'APPROVED',
    },
    partId: 'part-1',
    partName: 'Canonical bearing',
    process: { name: 'Incoming inspection' },
    reporter: 'Workshop',
    requestNo: 'IR-1',
    status: 'SUBMITTED',
    workOrderNumber: 'WO-1',
  };
}

describe('inspection material request service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists material requests with canonical supplier display', async () => {
    vi.mocked(
      prisma.qms_inspection_material_requests.findMany,
    ).mockResolvedValue([
      {
        id: 'application-1',
        inspectionRequest: {
          id: 'request-1',
          reporter: 'Workshop',
          requestNo: 'IR-1',
          supplier: { name: 'Supplier A' },
          team: 'Legacy supplier',
          workOrderNumber: 'WO-1',
        },
        inspectionRequestId: 'request-1',
        requestedName: 'New bearing',
        resolvedPartId: null,
        resolvedPartName: null,
        reviewRemark: null,
        reviewedAt: null,
        status: 'PENDING',
        submittedAt: new Date('2026-07-30T00:00:00.000Z'),
      },
    ] as any);
    vi.mocked(prisma.qms_inspection_material_requests.count).mockResolvedValue(
      1,
    );

    const result = await InspectionMaterialRequestService.list(reviewer, {
      page: 1,
      pageSize: 20,
      status: 'PENDING',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      requestedName: 'New bearing',
      supplierName: 'Supplier A',
    });
  });

  it('links an existing part and unblocks dispatch atomically', async () => {
    const tx = {
      qms_inspection_material_requests: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'application-1',
          inspectionRequest: {
            id: 'request-1',
            isDeleted: false,
            status: 'SUBMITTED',
          },
          requestedName: 'New bearing',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      qms_inspection_requests: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(buildResolvedRequest()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((callback: any) =>
      callback(tx),
    );
    vi.mocked(PartMasterService.assertActive).mockResolvedValue({
      id: 'part-1',
      name: 'Canonical bearing',
    });

    const result = await InspectionMaterialRequestService.approve(
      event,
      reviewer,
      'application-1',
      { mode: 'LINK_EXISTING', partId: 'part-1' },
    );

    expect(PartMasterService.assertActive).toHaveBeenCalledWith('part-1', tx);
    expect(tx.qms_inspection_requests.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          partId: 'part-1',
          partName: 'Canonical bearing',
        },
      }),
    );
    expect(tx.qms_inspection_material_requests.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resolutionMode: 'LINK_EXISTING',
          status: 'APPROVED',
        }),
      }),
    );
    expect(publishInspectionRequestCreated).toHaveBeenCalled();
    expect(result.partId).toBe('part-1');
  });

  it('creates a canonical part through part-master in the same transaction', async () => {
    const tx = {
      qms_inspection_material_requests: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'application-1',
          inspectionRequest: {
            id: 'request-1',
            isDeleted: false,
            status: 'SUBMITTED',
          },
          requestedName: 'New bearing',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      qms_inspection_requests: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(buildResolvedRequest()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((callback: any) =>
      callback(tx),
    );
    vi.mocked(PartMasterService.create).mockResolvedValue({
      id: 'part-1',
      name: 'Canonical bearing',
      sort: 0,
      status: 1,
    });

    await InspectionMaterialRequestService.approve(
      event,
      reviewer,
      'application-1',
      { mode: 'CREATE', name: 'Canonical bearing' },
    );

    expect(PartMasterService.create).toHaveBeenCalledWith(
      { name: 'Canonical bearing', sort: 0 },
      tx,
    );
  });

  it('rejects the application and cancels the inspection request', async () => {
    const tx = {
      qms_inspection_material_requests: {
        findFirst: vi.fn().mockResolvedValue({
          inspectionRequest: {
            dispatchTaskId: null,
            id: 'request-1',
            requestNo: 'IR-1',
          },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      qms_inspection_requests: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      qms_task_dispatches: {
        updateMany: vi.fn(),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((callback: any) =>
      callback(tx),
    );

    const result = await InspectionMaterialRequestService.reject(
      event,
      reviewer,
      'application-1',
      { remark: 'Duplicate or invalid material name' },
    );

    expect(tx.qms_inspection_requests.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'CANCELLED' },
      }),
    );
    expect(tx.qms_inspection_material_requests.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewRemark: 'Duplicate or invalid material name',
          status: 'REJECTED',
        }),
      }),
    );
    expect(recordBusinessAuditLog).toHaveBeenCalled();
    expect(result).toEqual({ id: 'application-1', status: 'REJECTED' });
  });

  it('requires the dedicated list permission for non-admin users', async () => {
    vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValue([]);

    await expect(
      InspectionMaterialRequestService.list(
        { id: 'user-1', roles: [], username: 'user' } as any,
        { page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(RbacService.getUserPermissionCodes).toHaveBeenCalledWith('user-1');
    expect(INSPECTION_MATERIAL_PERMISSION_CODES.LIST).toBe(
      'QMS:Inspection:MaterialRequests:List',
    );
  });
});
