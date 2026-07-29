import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { bootstrapInspectionRequestProcessOptions } from './inspection-request-process-option-bootstrap';

vi.mock('~/utils/prisma', () => ({
  default: {
    inspection_request_process_options: { createMany: vi.fn() },
    processes: { count: vi.fn(), findMany: vi.fn() },
  },
}));

describe('inspection request process option bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.processes.count).mockResolvedValue(0);
  });

  it('creates both category rows without overriding existing settings', async () => {
    vi.mocked(prisma.processes.findMany)
      .mockResolvedValueOnce([
        {
          id: 'process-1',
          inspectionRequestCategory: 'PROCESS',
          sort: 3,
        },
      ] as never)
      .mockResolvedValueOnce([]);
    vi.mocked(
      prisma.inspection_request_process_options.createMany,
    ).mockResolvedValue({ count: 1 });

    const result = await bootstrapInspectionRequestProcessOptions(10);

    expect(result).toEqual({ created: 1, scanned: 1 });
    expect(
      prisma.inspection_request_process_options.createMany,
    ).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          category: 'PROCESS',
          isEnabled: true,
          processId: 'process-1',
          sort: 3,
        }),
        expect.objectContaining({
          category: 'INCOMING',
          isEnabled: false,
          processId: 'process-1',
          sort: 3,
        }),
      ]),
      skipDuplicates: true,
    });
  });

  it('fails when any process is missing a category row after apply', async () => {
    vi.mocked(prisma.processes.findMany).mockResolvedValue([]);
    vi.mocked(prisma.processes.count).mockResolvedValueOnce(2);

    await expect(bootstrapInspectionRequestProcessOptions(10)).rejects.toThrow(
      'bootstrap incomplete for INCOMING',
    );
  });
});
