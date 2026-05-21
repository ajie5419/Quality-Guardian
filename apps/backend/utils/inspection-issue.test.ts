import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildInspectionIssueCreateData,
  buildInspectionIssueUpdateData,
  buildInspectionIssueUpsertPayload,
} from './inspection-issue';

vi.mock('~/utils/prisma', () => ({
  default: {},
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveProcessIdForWrite: vi.fn(),
}));

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
});
