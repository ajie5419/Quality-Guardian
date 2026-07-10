import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  buildInspectionIssueCreateData,
  buildInspectionIssueUpdateData,
  buildInspectionIssueUpsertPayload,
  findInspectionIssueAccessRecord,
  hasInspectionIssueAdminAccess,
  hasInspectionIssueWriteAccess,
} from './inspection-issue';

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_records: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveProcessIdForWrite: vi.fn(),
}));

vi.mock('~/utils/governed-write', async () => {
  const actual = await vi.importActual<typeof import('~/utils/governed-write')>(
    '~/utils/governed-write',
  );
  return {
    ...actual,
    buildGovernedCanonicalWritePairForTable: vi.fn(async () => ({})),
  };
});

describe('inspection-issue processId dual write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('injects processId into create payload from processName', async () => {
    const { resolveProcessIdForWrite } = await import(
      '~/utils/process-resolver'
    );
    vi.mocked(resolveProcessIdForWrite).mockResolvedValue('process-weld');

    const data = await buildInspectionIssueCreateData(
      {
        processName: '焊接',
        responsibleDepartment: '质量部',
        supplierName: ' 供应商A ',
        description: 'desc',
      },
      {
        id: 'ISS-2026-TEST',
        serialNumber: 1,
      },
    );

    expect(resolveProcessIdForWrite).toHaveBeenCalledWith({
      processName: '焊接',
    });
    expect(data.process).toEqual({
      connect: {
        id: 'process-weld',
      },
    });
    expect(data.responsibleDepartment).toBe('质量部');
    expect(data.supplierName).toBe('供应商A');
  });

  it('serializes responsibleDepartments and keeps legacy field on create', async () => {
    const data = await buildInspectionIssueCreateData(
      {
        responsibleDepartment: '质量部',
        responsibleDepartments: ['生产部', '工艺部'],
      },
      {
        id: 'ISS-2026-DEPT',
        serialNumber: 2,
      },
    );

    expect(data.responsibleDepartment).toBe('生产部');
    expect(data.responsibleDepartments).toBe(
      JSON.stringify(['生产部', '工艺部']),
    );
  });

  it('injects processId into update payload when processName is provided', async () => {
    const { resolveProcessIdForWrite } = await import(
      '~/utils/process-resolver'
    );
    vi.mocked(resolveProcessIdForWrite).mockResolvedValue('process-paint');

    const updateData = await buildInspectionIssueUpdateData(
      {
        processName: '喷涂',
      },
      null,
    );

    expect(resolveProcessIdForWrite).toHaveBeenCalledWith({
      processName: '喷涂',
    });
    expect(updateData.process).toEqual({
      connect: {
        id: 'process-paint',
      },
    });
  });

  it('writes work order relation on update instead of scalar foreign key', async () => {
    const updateData = await buildInspectionIssueUpdateData(
      {
        workOrderNumber: ' WO-1001 ',
      },
      null,
    );

    expect((updateData as Record<string, unknown>).workOrderNumber).toBe(
      undefined,
    );
    expect(updateData.work_orders).toEqual({
      connect: {
        workOrderNumber: 'WO-1001',
      },
    });
  });

  it('serializes responsibleDepartments and keeps legacy field on update', async () => {
    const updateData = await buildInspectionIssueUpdateData(
      {
        responsibleDepartment: '质量部',
        responsibleDepartments: ['售后部', '技术部'],
      },
      null,
    );

    expect(updateData.responsibleDepartment).toBe('售后部');
    expect(updateData.responsibleDepartments).toBe(
      JSON.stringify(['售后部', '技术部']),
    );
  });

  it('injects processId into upsert payload when processName is provided', async () => {
    const { resolveProcessIdForWrite } = await import(
      '~/utils/process-resolver'
    );
    vi.mocked(resolveProcessIdForWrite).mockResolvedValue('process-assemble');

    const payload = await buildInspectionIssueUpsertPayload(
      {
        ncNumber: 'NC-25KJ-001',
        processName: '组装',
      },
      100,
    );

    expect(payload).not.toBeNull();
    expect(resolveProcessIdForWrite).toHaveBeenCalledWith({
      processName: '组装',
    });
    expect(payload?.create.process).toEqual({
      connect: {
        id: 'process-assemble',
      },
    });
    expect(payload?.update.process).toEqual({
      connect: {
        id: 'process-assemble',
      },
    });
    expect(payload?.create.processName).toBe('组装');
    expect(payload?.update.processName).toBe('组装');
  });

  it('normalizes wave1 governed fields in upsert payload', async () => {
    const { resolveProcessIdForWrite } = await import(
      '~/utils/process-resolver'
    );
    vi.mocked(resolveProcessIdForWrite).mockResolvedValue(null);

    const payload = await buildInspectionIssueUpsertPayload(
      {
        defectType: '  焊接缺陷 ',
        defectSubtype: '  气孔 ',
        division: '  车辆 ',
        responsibleDepartment: ' 生产 OBU ',
        supplierName: ' 供应商B ',
        ncNumber: 'NC-25KJ-002',
      },
      101,
    );

    expect(payload).not.toBeNull();
    expect(payload?.create.defectType).toBe('焊接缺陷');
    expect(payload?.create.defectSubtype).toBe('气孔');
    expect(payload?.create.division).toBe('车辆');
    expect(payload?.create.responsibleDepartment).toBe('生产 OBU');
    expect(payload?.create.supplierName).toBe('供应商B');
    expect(payload?.update.defectType).toBe('焊接缺陷');
    expect(payload?.update.defectSubtype).toBe('气孔');
    expect(payload?.update.division).toBe('车辆');
    expect(payload?.update.responsibleDepartment).toBe('生产 OBU');
    expect(payload?.update.supplierName).toBe('供应商B');
  });

  it('writes canonical ids for defect fields when governance kernel resolves', async () => {
    const { resolveProcessIdForWrite } = await import(
      '~/utils/process-resolver'
    );
    const { buildGovernedCanonicalWritePairForTable } = await import(
      '~/utils/governed-write'
    );
    vi.mocked(resolveProcessIdForWrite).mockResolvedValue(null);
    vi.mocked(buildGovernedCanonicalWritePairForTable).mockResolvedValue({
      defectSubtypeId: 'dict-defect-subtype',
      defectTypeId: 'dict-defect-type',
    });

    const payload = await buildInspectionIssueUpsertPayload(
      {
        defectType: '焊接缺陷',
        defectSubtype: '气孔',
        ncNumber: 'NC-25KJ-003',
      },
      102,
    );

    expect(payload?.create.defectTypeId).toBe('dict-defect-type');
    expect(payload?.create.defectSubtypeId).toBe('dict-defect-subtype');
    expect(payload?.update.defectTypeId).toBe('dict-defect-type');
    expect(payload?.update.defectSubtypeId).toBe('dict-defect-subtype');
  });

  it('writes rootCauseId into quality record payloads when governance helper resolves', async () => {
    const { resolveProcessIdForWrite } = await import(
      '~/utils/process-resolver'
    );
    const { buildGovernedCanonicalWritePairForTable } = await import(
      '~/utils/governed-write'
    );
    vi.mocked(resolveProcessIdForWrite).mockResolvedValue(null);
    vi.mocked(buildGovernedCanonicalWritePairForTable).mockResolvedValue({
      rootCauseId: 'dict-root-cause',
    });

    const createData = await buildInspectionIssueCreateData(
      {
        rootCause: '焊缝污染',
      },
      {
        id: 'ISS-2026-ROOT',
        serialNumber: 200,
      },
    );
    expect((createData as Record<string, unknown>).rootCauseId).toBe(
      'dict-root-cause',
    );

    const updateData = await buildInspectionIssueUpdateData(
      {
        rootCause: '焊缝污染',
      },
      null,
    );
    expect((updateData as Record<string, unknown>).rootCauseId).toBe(
      'dict-root-cause',
    );

    const payload = await buildInspectionIssueUpsertPayload(
      {
        rootCause: '焊缝污染',
        ncNumber: 'NC-25KJ-004',
      },
      103,
    );
    expect((payload?.create as Record<string, unknown>)?.rootCauseId).toBe(
      'dict-root-cause',
    );
    expect((payload?.update as Record<string, unknown>)?.rootCauseId).toBe(
      'dict-root-cause',
    );
  });
});

describe('inspection issue ownership rules', () => {
  it('excludes soft-deleted records from ownership checks', async () => {
    vi.mocked(prisma.quality_records.findUnique).mockResolvedValue(null);

    await findInspectionIssueAccessRecord('issue-1');

    expect(prisma.quality_records.findUnique).toHaveBeenCalledWith({
      where: { id: 'issue-1', isDeleted: false },
      select: {
        createdBy: true,
        inspectionId: true,
        nonConformanceNumber: true,
      },
    });
  });

  it.each(['admin', 'super_admin', 'system_admin'])(
    'recognizes %s as read-all administration',
    (role) => {
      expect(hasInspectionIssueAdminAccess([role])).toBe(true);
    },
  );

  it.each(['quality_supervisor', 'supervisor', 'administrator'])(
    'does not treat %s as read-all administration',
    (role) => {
      expect(hasInspectionIssueAdminAccess([role])).toBe(false);
    },
  );

  it('allows writes only for the creating user, including for admins', () => {
    expect(
      hasInspectionIssueWriteAccess({ createdBy: 'user-1', userId: 'user-1' }),
    ).toBe(true);
    expect(
      hasInspectionIssueWriteAccess({ createdBy: 'user-1', userId: 'admin-1' }),
    ).toBe(false);
  });
});
