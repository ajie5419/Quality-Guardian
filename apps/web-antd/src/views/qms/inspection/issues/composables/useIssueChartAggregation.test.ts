import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getIssueChartOption,
  ISSUE_CHART_DIMENSIONS,
  ISSUE_CHART_METRICS,
  renderCustomChart,
} from './useIssueChartAggregation';

const {
  mockBuildChartOptionFromAggregated,
  mockGetInspectionIssueChartAggregate,
} = vi.hoisted(() => ({
  mockBuildChartOptionFromAggregated: vi.fn(),
  mockGetInspectionIssueChartAggregate: vi.fn(),
}));

vi.mock('#/api/qms/inspection', () => ({
  getInspectionIssueChartAggregate: mockGetInspectionIssueChartAggregate,
}));

vi.mock('#/components/Qms/ChartBuilder/composables/useChartCore', () => ({
  buildChartOptionFromAggregated: mockBuildChartOptionFromAggregated,
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('iSSUE_CHART_DIMENSIONS', () => {
  it('has 10 dimension options', () => {
    expect(ISSUE_CHART_DIMENSIONS).toHaveLength(10);
  });

  it('includes reportMonth and defectType', () => {
    const values = ISSUE_CHART_DIMENSIONS.map((d) => d.value);
    expect(values).toContain('reportMonth');
    expect(values).toContain('defectType');
  });
});

describe('iSSUE_CHART_METRICS', () => {
  it('has 3 metric options', () => {
    expect(ISSUE_CHART_METRICS).toHaveLength(3);
  });

  it('includes count, lossAmount, quantity', () => {
    const values = ISSUE_CHART_METRICS.map((m) => m.value);
    expect(values).toEqual(['count', 'lossAmount', 'quantity']);
  });
});

describe('getIssueChartOption', () => {
  it('calls API with correct params and builds chart option', async () => {
    mockGetInspectionIssueChartAggregate.mockResolvedValueOnce({
      items: [
        {
          id: 'defect-a',
          name: 'A',
          resolutionStatus: 'RESOLVED',
          value: 10,
        },
      ],
    });
    mockBuildChartOptionFromAggregated.mockReturnValueOnce({ series: [] });

    const result = await getIssueChartOption(
      {
        dimension: 'defectType',
        metric: 'count',
        id: '1',
        title: 't',
        chartType: 'bar',
      },
      { year: 2026 },
    );

    expect(mockGetInspectionIssueChartAggregate).toHaveBeenCalledWith({
      dimension: 'defectType',
      metric: 'count',
      top: 15,
      year: 2026,
    });
    expect(mockBuildChartOptionFromAggregated).toHaveBeenCalledWith(
      [
        {
          id: 'defect-a',
          name: 'A',
          resolutionStatus: 'RESOLVED',
          value: 10,
        },
      ],
      {
        dimension: 'defectType',
        metric: 'count',
        id: '1',
        title: 't',
        chartType: 'bar',
      },
      ISSUE_CHART_METRICS,
    );
    expect(result).toEqual({ series: [] });
  });

  it('passes canonical identity rows through without client-side resolution', async () => {
    mockGetInspectionIssueChartAggregate.mockResolvedValueOnce({
      items: [
        {
          id: 'division-1',
          name: 'Quality division',
          resolutionStatus: 'RESOLVED',
          value: 5,
        },
      ],
    });
    mockBuildChartOptionFromAggregated.mockReturnValueOnce({});

    await getIssueChartOption(
      {
        dimension: 'division',
        metric: 'count',
        id: '2',
        title: 't',
        chartType: 'bar',
      },
      {},
    );

    const rows = mockBuildChartOptionFromAggregated.mock.calls[0]?.[0];
    expect(rows).toEqual([
      {
        id: 'division-1',
        name: 'Quality division',
        resolutionStatus: 'RESOLVED',
        value: 5,
      },
    ]);
  });

  it('handles missing items as empty array', async () => {
    mockGetInspectionIssueChartAggregate.mockResolvedValueOnce({});
    mockBuildChartOptionFromAggregated.mockReturnValueOnce(null);

    const result = await getIssueChartOption(
      {
        dimension: 'status',
        metric: 'count',
        id: '5',
        title: 't',
        chartType: 'bar',
      },
      {},
    );

    expect(mockBuildChartOptionFromAggregated).toHaveBeenCalledWith(
      [],
      {
        dimension: 'status',
        metric: 'count',
        id: '5',
        title: 't',
        chartType: 'bar',
      },
      ISSUE_CHART_METRICS,
    );
    expect(result).toBeNull();
  });
});

describe('renderCustomChart', () => {
  it('does nothing when renderFn is falsy', async () => {
    await renderCustomChart(
      null as any,
      { dimension: 'x', metric: 'y', id: '6', title: 't', chartType: 'bar' },
      {},
    );
    expect(mockGetInspectionIssueChartAggregate).not.toHaveBeenCalled();
  });

  it('calls renderFn with the chart option', async () => {
    mockGetInspectionIssueChartAggregate.mockResolvedValueOnce({ items: [] });
    mockBuildChartOptionFromAggregated.mockReturnValueOnce({ option: true });
    const renderFn = vi.fn();

    await renderCustomChart(
      renderFn,
      {
        dimension: 'status',
        metric: 'count',
        id: '7',
        title: 't',
        chartType: 'bar',
      },
      { year: 2026 },
    );

    expect(renderFn).toHaveBeenCalledWith({ option: true });
  });

  it('does not call renderFn when option is null', async () => {
    mockGetInspectionIssueChartAggregate.mockResolvedValueOnce({ items: [] });
    mockBuildChartOptionFromAggregated.mockReturnValueOnce(null);
    const renderFn = vi.fn();

    await renderCustomChart(
      renderFn,
      {
        dimension: 'status',
        metric: 'count',
        id: '8',
        title: 't',
        chartType: 'bar',
      },
      {},
    );

    expect(renderFn).not.toHaveBeenCalled();
  });
});
