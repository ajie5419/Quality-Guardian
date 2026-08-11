import type { Prisma } from '@prisma/client';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveLegacyCloseRequestResponsibility } from './inspection-request-close-responsibility.service';

const mocks = vi.hoisted(() => ({
  assertPolicy: vi.fn(),
  resolveResponsibility: vi.fn(),
}));

vi.mock('./inspection-issue-create.service', () => ({
  resolveInspectionIssueResponsibility: mocks.resolveResponsibility,
}));
vi.mock('./inspection-request-responsibility-policy.service', () => ({
  assertInspectionRequestResponsibilityPolicy: mocks.assertPolicy,
}));
vi.mock('./inspection-request-close.schema', () => ({
  failCloseRequest: (code: string, message: string) => {
    throw Object.assign(new Error(message), { code });
  },
}));

const baseRequest = { id: 'request-1', teamId: 'team-1' };
const linkedIssue = {
  responsibilityType: 'INTERNAL_DEPARTMENT',
  responsibleDepartmentId: 'dept-assembly',
};

describe('legacy inspection request close responsibility', () => {
  const updateMany = vi.fn();
  const tx = {
    qms_inspection_requests: { updateMany },
  } as unknown as Prisma.TransactionClient;

  beforeEach(() => {
    vi.clearAllMocks();
    updateMany.mockResolvedValue({ count: 1 });
    mocks.resolveResponsibility.mockResolvedValue({
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartment: '装配部',
      responsibleDepartmentId: 'dept-assembly',
      supplierId: null,
      supplierName: null,
    });
  });

  it('persists a fully resolved legacy close responsibility with a CAS guard', async () => {
    const result = await resolveLegacyCloseRequestResponsibility({
      linkedIssue,
      request: baseRequest,
      tx,
    });

    expect(result.resolvedLegacy).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-assembly',
        }),
        where: expect.objectContaining({
          isDeleted: false,
          responsibilityType: null,
          responsibleDepartment: null,
          responsibleDepartmentId: null,
          supplierId: null,
          teamId: 'team-1',
        }),
      }),
    );
  });

  it('rejects an incomplete persisted fact instead of overwriting it', async () => {
    await expect(
      resolveLegacyCloseRequestResponsibility({
        linkedIssue,
        request: { ...baseRequest, responsibilityType: 'INTERNAL_DEPARTMENT' },
        tx,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent responsibility write', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      resolveLegacyCloseRequestResponsibility({
        linkedIssue,
        request: baseRequest,
        tx,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects a concurrent supplier identity change without writing the triad', async () => {
    mocks.resolveResponsibility.mockResolvedValueOnce({
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartment: '生产 OBU',
      responsibleDepartmentId: 'dept-production',
      supplierId: 'supplier-before-close',
      supplierName: 'Supplier A',
    });
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      resolveLegacyCloseRequestResponsibility({
        linkedIssue: {
          responsibilityType: 'OUTSOURCING_UNIT',
          responsibleDepartmentId: 'dept-production',
          supplierId: 'supplier-before-close',
        },
        request: { ...baseRequest, supplierId: 'supplier-before-close' },
        tx,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          supplierId: 'supplier-before-close',
        }),
      }),
    );
  });

  it('does not update a soft-deleted request', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      resolveLegacyCloseRequestResponsibility({
        linkedIssue,
        request: baseRequest,
        tx,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDeleted: false }),
      }),
    );
  });
});
