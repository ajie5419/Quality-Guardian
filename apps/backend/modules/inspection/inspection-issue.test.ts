import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildInspectionIssueCreateData,
  buildInspectionIssueUpdateData,
  buildInspectionIssueUpsertPayload,
} from './inspection-issue';

vi.mock('~/utils/prisma', () => ({
  default: {},
}));

vi.mock('~/governance/master-data/process-resolver', () => ({
  resolveProcessIdForWrite: vi.fn(),
}));

vi.mock('~/governance/master-data/master-data-governance-write', async () => {
  const actual = await vi.importActual<
    typeof import('~/governance/master-data/master-data-governance-write')
  >('~/governance/master-data/master-data-governance-write');
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
      '~/governance/master-data/process-resolver'
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

  it('injects processId into update payload when processName is provided', async () => {
    const { resolveProcessIdForWrite } = await import(
      '~/governance/master-data/process-resolver'
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

  it('injects processId into upsert payload when processName is provided', async () => {
    const { resolveProcessIdForWrite } = await import(
      '~/governance/master-data/process-resolver'
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
      '~/governance/master-data/process-resolver'
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
      '~/governance/master-data/process-resolver'
    );
    const { buildGovernedCanonicalWritePairForTable } = await import(
      '~/governance/master-data/master-data-governance-write'
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
      '~/governance/master-data/process-resolver'
    );
    const { buildGovernedCanonicalWritePairForTable } = await import(
      '~/governance/master-data/master-data-governance-write'
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
