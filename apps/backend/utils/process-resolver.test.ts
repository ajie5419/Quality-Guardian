import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  buildProcessNameWhere,
  resolveProcessIdForWrite,
  resolveProcessIdsByNames,
} from './process-resolver';

vi.mock('~/utils/prisma', () => ({
  default: {
    processes: {
      findMany: vi.fn(),
    },
  },
}));

describe('process-resolver helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolveProcessIdForWrite returns explicit process id first', async () => {
    const processId = await resolveProcessIdForWrite({
      explicitProcessId: 'p-explicit',
      processName: '焊接',
    });

    expect(processId).toBe('p-explicit');
    expect((prisma.processes.findMany as any).mock.calls.length).toBe(0);
  });

  it('resolveProcessIdForWrite returns undefined when keeping existing and name missing', async () => {
    const processId = await resolveProcessIdForWrite({
      keepExistingWhenNameMissing: true,
      processName: '',
    });

    expect(processId).toBeUndefined();
  });

  it('resolveProcessIdsByNames batches lookup and de-duplicates names', async () => {
    (prisma.processes.findMany as any).mockResolvedValue([
      { id: 'p-weld', name: '焊接' },
      { id: 'p-paint', name: '喷涂' },
    ]);

    const result = await resolveProcessIdsByNames([
      '焊接',
      '焊接',
      '喷涂',
      null,
      undefined,
      '',
    ]);

    expect(prisma.processes.findMany).toHaveBeenCalledTimes(1);
    expect(result.get('焊接')).toBe('p-weld');
    expect(result.get('喷涂')).toBe('p-paint');
  });

  it('buildProcessNameWhere returns OR condition when process id resolved', async () => {
    (prisma.processes.findMany as any).mockResolvedValue([
      { id: 'p-weld', name: '焊接' },
    ]);

    const where = await buildProcessNameWhere('焊接');

    expect(where).toEqual({
      OR: [{ processName: '焊接' }, { processId: 'p-weld' }],
    });
  });

  it('buildProcessNameWhere returns field-only condition when process id missing', async () => {
    (prisma.processes.findMany as any).mockResolvedValue([]);

    const where = await buildProcessNameWhere('未知工序', {
      field: 'inspectionProcessName',
    });

    expect(where).toEqual({
      inspectionProcessName: '未知工序',
    });
  });
});
