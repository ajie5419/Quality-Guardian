import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionCoreService } from '~/modules/inspection/inspection-core.service';
import { InspectionIssueService } from '~/modules/inspection/inspection-issue.service';

vi.mock('~/modules/inspection/inspection-core.service', () => ({
  InspectionCoreService: {
    buildIssueTrendData: vi.fn(),
    deleteRecord: vi.fn(),
    generateNextNcNumber: vi.fn(),
    getIssueChartAggregation: vi.fn(),
    getIssues: vi.fn(),
    getIssueStats: vi.fn(),
  },
}));

describe('inspectionIssueService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delegate buildIssueTrendData to InspectionCoreService', () => {
    expect(InspectionIssueService.buildIssueTrendData).toBe(
      InspectionCoreService.buildIssueTrendData,
    );
  });

  it('should delegate deleteRecord to InspectionCoreService', () => {
    expect(InspectionIssueService.deleteRecord).toBe(
      InspectionCoreService.deleteRecord,
    );
  });

  it('should delegate generateNextNcNumber to InspectionCoreService', () => {
    expect(InspectionIssueService.generateNextNcNumber).toBe(
      InspectionCoreService.generateNextNcNumber,
    );
  });

  it('should delegate getIssueChartAggregation to InspectionCoreService', () => {
    expect(InspectionIssueService.getIssueChartAggregation).toBe(
      InspectionCoreService.getIssueChartAggregation,
    );
  });

  it('should delegate getIssues to InspectionCoreService', () => {
    expect(InspectionIssueService.getIssues).toBe(
      InspectionCoreService.getIssues,
    );
  });

  it('should delegate getIssueStats to InspectionCoreService', () => {
    expect(InspectionIssueService.getIssueStats).toBe(
      InspectionCoreService.getIssueStats,
    );
  });
});
