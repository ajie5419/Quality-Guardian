import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportVehicleCommissioningIssuesWorkbook } from '~/modules/vehicle-commissioning/vehicle-commissioning-export.service';

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    getFileBufferByStoredName: vi.fn(),
  },
}));

vi.mock('~/utils/paths', () => ({
  UPLOAD_DIR: '/tmp/uploads',
}));

const mockGetIssues = vi.fn();

describe('exportVehicleCommissioningIssuesWorkbook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports an empty workbook when there are no issues', async () => {
    mockGetIssues.mockResolvedValue({ items: [], total: 0 });

    const result = await exportVehicleCommissioningIssuesWorkbook(
      { getIssues: mockGetIssues },
      {},
    );

    expect(result).toBeInstanceOf(Buffer);
    expect(mockGetIssues).toHaveBeenCalledWith({});
  });

  it('exports issues without photos as plain text rows', async () => {
    mockGetIssues.mockResolvedValue({
      items: [
        {
          claimNotes: null,
          claimStatus: 'OPEN',
          date: '2026-01-15',
          description: 'Brake issue',
          isClaim: false,
          lossAmount: 100,
          partName: 'Brake',
          projectName: 'Project A',
          recoveredAmount: 0,
          responsibleDepartment: 'Dept1',
          severity: 'major',
          solution: 'Fix it',
          status: 'OPEN',
          workOrderNumber: 'WO-1',
        },
      ],
      total: 1,
    });

    const result = await exportVehicleCommissioningIssuesWorkbook(
      { getIssues: mockGetIssues },
      { page: 1 },
    );

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
    expect(mockGetIssues).toHaveBeenCalledWith({ page: 1 });
  });

  it('exports issues with photo URL', async () => {
    mockGetIssues.mockResolvedValue({
      items: [
        {
          claimNotes: null,
          claimStatus: 'OPEN',
          date: '2026-01-15',
          description: 'Sensor issue',
          isClaim: true,
          lossAmount: 200,
          partName: 'Sensor',
          photos: ['/uploads/photo.png'],
          projectName: 'Project B',
          recoveredAmount: 50,
          responsibleDepartment: 'Dept2',
          severity: 'critical',
          solution: 'Replace',
          status: 'IN_PROGRESS',
          workOrderNumber: 'WO-2',
        },
      ],
      total: 1,
    });

    const result = await exportVehicleCommissioningIssuesWorkbook(
      { getIssues: mockGetIssues },
      {},
    );

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles multiple issues in a single export', async () => {
    mockGetIssues.mockResolvedValue({
      items: [
        {
          date: '2026-01-10',
          description: 'Issue 1',
          isClaim: false,
          partName: 'Part A',
          severity: 'minor',
          status: 'CLOSED',
          workOrderNumber: 'WO-1',
        },
        {
          date: '2026-01-11',
          description: 'Issue 2',
          isClaim: true,
          partName: 'Part B',
          severity: 'major',
          status: 'OPEN',
          workOrderNumber: 'WO-2',
        },
        {
          date: '2026-01-12',
          description: 'Issue 3',
          isClaim: false,
          partName: 'Part C',
          severity: 'critical',
          status: 'CONFIRMED',
          workOrderNumber: 'WO-3',
        },
      ],
      total: 3,
    });

    const result = await exportVehicleCommissioningIssuesWorkbook(
      { getIssues: mockGetIssues },
      {},
    );

    expect(result).toBeInstanceOf(Buffer);
  });
});
