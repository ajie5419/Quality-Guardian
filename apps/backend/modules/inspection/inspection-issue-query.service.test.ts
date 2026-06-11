import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionIssueListService } from '~/modules/inspection/inspection-issue-list.service';
import { InspectionIssueNumberingService } from '~/modules/inspection/inspection-issue-numbering.service';
import { InspectionIssueQueryService } from '~/modules/inspection/inspection-issue-query.service';
import { InspectionIssueStatsService } from '~/modules/inspection/inspection-issue-stats.service';

vi.mock('~/modules/inspection/inspection-issue-list.service', () => ({
  InspectionIssueListService: {
    getIssues: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-issue-stats.service', () => ({
  InspectionIssueStatsService: {
    getIssueStats: vi.fn(),
    getIssueChartAggregation: vi.fn(),
    buildIssueTrendData: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-issue-numbering.service', () => ({
  InspectionIssueNumberingService: {
    generateNextNcNumber: vi.fn(),
    deleteRecord: vi.fn(),
  },
}));

describe('inspectionIssueQueryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose getIssues from InspectionIssueListService', () => {
    expect(InspectionIssueQueryService.getIssues).toBe(
      InspectionIssueListService.getIssues,
    );
  });

  it('should expose getIssueStats from InspectionIssueStatsService', () => {
    expect(InspectionIssueQueryService.getIssueStats).toBe(
      InspectionIssueStatsService.getIssueStats,
    );
  });

  it('should expose getIssueChartAggregation from InspectionIssueStatsService', () => {
    expect(InspectionIssueQueryService.getIssueChartAggregation).toBe(
      InspectionIssueStatsService.getIssueChartAggregation,
    );
  });

  it('should expose buildIssueTrendData from InspectionIssueStatsService', () => {
    expect(InspectionIssueQueryService.buildIssueTrendData).toBe(
      InspectionIssueStatsService.buildIssueTrendData,
    );
  });

  it('should expose generateNextNcNumber from InspectionIssueNumberingService', () => {
    expect(InspectionIssueQueryService.generateNextNcNumber).toBe(
      InspectionIssueNumberingService.generateNextNcNumber,
    );
  });

  it('should expose deleteRecord from InspectionIssueNumberingService', () => {
    expect(InspectionIssueQueryService.deleteRecord).toBe(
      InspectionIssueNumberingService.deleteRecord,
    );
  });
});
