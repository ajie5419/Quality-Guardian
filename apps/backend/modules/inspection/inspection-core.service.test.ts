import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionCoreService } from '~/modules/inspection/inspection-core.service';

vi.mock('~/modules/inspection/inspection-reporting.service', () => ({
  InspectionReportingService: {
    determineItemResult: vi.fn(),
    generateSerialNumber: vi.fn(),
    normalizeQuantitySummary: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-record-query.service', () => ({
  InspectionRecordQueryService: {
    findById: vi.fn(),
    findAll: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-record-types', () => ({
  InspectionRecordRules: {
    determineItemResult: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-record-mutation.service', () => ({
  InspectionRecordMutationService: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-archive-task.service', () => ({
  InspectionArchiveTaskService: {
    getArchiveTasks: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-issue-query.service', () => ({
  InspectionIssueQueryService: {
    getIssues: vi.fn(),
    getIssueStats: vi.fn(),
    getIssueChartAggregation: vi.fn(),
    buildIssueTrendData: vi.fn(),
    generateNextNcNumber: vi.fn(),
    deleteRecord: vi.fn(),
  },
}));

describe('inspectionCoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose methods from InspectionReportingService', () => {
    expect(InspectionCoreService.determineItemResult).toBeDefined();
    expect(InspectionCoreService.generateSerialNumber).toBeDefined();
    expect(InspectionCoreService.normalizeQuantitySummary).toBeDefined();
  });

  it('should expose methods from InspectionRecordQueryService', () => {
    expect(InspectionCoreService.findById).toBeDefined();
    expect(InspectionCoreService.findAll).toBeDefined();
  });

  it('should expose methods from InspectionRecordRules', () => {
    expect(InspectionCoreService.determineItemResult).toBeDefined();
  });

  it('should expose methods from InspectionRecordMutationService', () => {
    expect(InspectionCoreService.create).toBeDefined();
    expect(InspectionCoreService.update).toBeDefined();
  });

  it('should expose methods from InspectionArchiveTaskService', () => {
    expect(InspectionCoreService.getArchiveTasks).toBeDefined();
  });

  it('should expose methods from InspectionIssueQueryService', () => {
    expect(InspectionCoreService.getIssues).toBeDefined();
    expect(InspectionCoreService.getIssueStats).toBeDefined();
    expect(InspectionCoreService.getIssueChartAggregation).toBeDefined();
    expect(InspectionCoreService.buildIssueTrendData).toBeDefined();
    expect(InspectionCoreService.generateNextNcNumber).toBeDefined();
    expect(InspectionCoreService.deleteRecord).toBeDefined();
  });
});
