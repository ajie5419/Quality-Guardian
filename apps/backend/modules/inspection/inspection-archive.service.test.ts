import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionArchiveService } from '~/modules/inspection/inspection-archive.service';
import { InspectionCoreService } from '~/modules/inspection/inspection-core.service';

vi.mock('~/modules/inspection/inspection-core.service', () => ({
  InspectionCoreService: {
    getArchiveTasks: vi.fn(),
    updateArchiveTaskStatus: vi.fn(),
  },
}));

describe('inspectionArchiveService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should re-export getArchiveTasks from InspectionCoreService', () => {
    expect(InspectionArchiveService.getArchiveTasks).toBe(
      InspectionCoreService.getArchiveTasks,
    );
  });

  it('should re-export updateArchiveTaskStatus from InspectionCoreService', () => {
    expect(InspectionArchiveService.updateArchiveTaskStatus).toBe(
      InspectionCoreService.updateArchiveTaskStatus,
    );
  });

  it('should delegate getArchiveTasks call', async () => {
    const expectedResult = { items: [], total: 0 };
    (InspectionCoreService.getArchiveTasks as any).mockResolvedValue(
      expectedResult,
    );

    const result = await InspectionArchiveService.getArchiveTasks({
      page: 1,
      pageSize: 10,
    });

    expect(result).toEqual(expectedResult);
    expect(InspectionCoreService.getArchiveTasks).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
    });
  });

  it('should delegate updateArchiveTaskStatus call', async () => {
    const updatedTask = { id: 'task-1', status: 'ARCHIVED' };
    (InspectionCoreService.updateArchiveTaskStatus as any).mockResolvedValue(
      updatedTask,
    );

    const result = await InspectionArchiveService.updateArchiveTaskStatus({
      id: 'task-1',
      status: 'ARCHIVED',
    });

    expect(result).toEqual(updatedTask);
    expect(InspectionCoreService.updateArchiveTaskStatus).toHaveBeenCalledWith({
      id: 'task-1',
      status: 'ARCHIVED',
    });
  });
});
