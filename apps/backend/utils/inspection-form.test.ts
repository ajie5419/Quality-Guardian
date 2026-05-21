import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildInspectionFormProcessFilter } from './inspection-form';

vi.mock('@qgs/domain', () => ({
  resolveInspectionFormProcessCandidates: vi.fn(),
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveProcessIdForWrite: vi.fn(),
}));

describe('inspection-form helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty object when processName and fallback processId are missing', async () => {
    const where = await buildInspectionFormProcessFilter({
      processName: '',
    });

    expect(where).toEqual({});
  });

  it('returns processId filter when processName is missing but fallback processId exists', async () => {
    const where = await buildInspectionFormProcessFilter({
      processId: 'p-fallback',
      processName: '',
    });

    expect(where).toEqual({ processId: 'p-fallback' });
  });

  it('returns OR filter when process id resolved', async () => {
    const { resolveInspectionFormProcessCandidates } = await import(
      '@qgs/domain'
    );
    const { resolveProcessIdForWrite } = await import(
      '~/utils/process-resolver'
    );

    vi.mocked(resolveInspectionFormProcessCandidates).mockReturnValue(['焊接']);
    vi.mocked(resolveProcessIdForWrite).mockResolvedValue('p-weld');

    const where = await buildInspectionFormProcessFilter({
      category: 'PROCESS',
      processName: '焊接',
    });

    expect(where).toEqual({
      OR: [{ processId: 'p-weld' }, { processName: { in: ['焊接'] } }],
    });
  });

  it('returns processName in filter when process id not resolved', async () => {
    const { resolveInspectionFormProcessCandidates } = await import(
      '@qgs/domain'
    );
    const { resolveProcessIdForWrite } = await import(
      '~/utils/process-resolver'
    );

    vi.mocked(resolveInspectionFormProcessCandidates).mockReturnValue([]);
    vi.mocked(resolveProcessIdForWrite).mockResolvedValue(null);

    const where = await buildInspectionFormProcessFilter({
      processName: '  喷涂 ',
    });

    expect(where).toEqual({
      processName: {
        in: ['喷涂'],
      },
    });
  });
});
