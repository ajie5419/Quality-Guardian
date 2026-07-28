import type { IdentityAggregateItem } from '@qgs/shared';

import { describe, expect, it } from 'vitest';

import { buildChartOptionFromAggregated } from './useChartCore';

const SAME_NAME_IDENTITIES: IdentityAggregateItem[] = [
  {
    id: 'defect-a',
    name: 'Same defect',
    resolutionStatus: 'RESOLVED',
    value: 10,
  },
  {
    id: 'defect-b',
    name: 'Same defect',
    resolutionStatus: 'RESOLVED',
    value: 5,
  },
];

const METRICS = [{ label: 'Count', value: 'count' }];

describe('buildChartOptionFromAggregated', () => {
  it('keeps same-name identities distinct in category charts', () => {
    const option = buildChartOptionFromAggregated(
      SAME_NAME_IDENTITIES,
      {
        chartType: 'bar',
        dimension: 'defectType',
        id: 'chart-1',
        metric: 'count',
        title: 'Defects',
      },
      METRICS,
    ) as any;

    expect(option.xAxis.data).toEqual([
      'RESOLVED:defect-a',
      'RESOLVED:defect-b',
    ]);
    expect(option.xAxis.axisLabel.formatter('RESOLVED:defect-a')).toBe(
      'Same defec...',
    );
    expect(option.series[0].data).toEqual([
      expect.objectContaining({
        displayName: 'Same defect',
        id: 'defect-a',
        identityKey: 'RESOLVED:defect-a',
        resolutionStatus: 'RESOLVED',
        value: 10,
      }),
      expect.objectContaining({
        displayName: 'Same defect',
        id: 'defect-b',
        identityKey: 'RESOLVED:defect-b',
        resolutionStatus: 'RESOLVED',
        value: 5,
      }),
    ]);
    expect(
      option.tooltip.formatter([
        {
          axisValue: 'RESOLVED:defect-a',
          data: option.series[0].data[0],
          marker: '',
          seriesName: 'Count',
        },
      ]),
    ).toBe('Same defect<br/>Count: 10');
  });

  it('uses identity keys for independent pie legend interaction', () => {
    const option = buildChartOptionFromAggregated(
      SAME_NAME_IDENTITIES,
      {
        chartType: 'pie',
        dimension: 'defectType',
        id: 'chart-2',
        metric: 'count',
        title: 'Defects',
      },
      METRICS,
    ) as any;

    expect(option.series[0].data.map((item: any) => item.name)).toEqual([
      'RESOLVED:defect-a',
      'RESOLVED:defect-b',
    ]);
    expect(option.legend.formatter('RESOLVED:defect-a')).toBe('Same defect');
    expect(option.legend.formatter('RESOLVED:defect-b')).toBe('Same defect');
    expect(
      option.tooltip.formatter({
        data: option.series[0].data[1],
        percent: 33.3,
      }),
    ).toBe('Same defect: 5 (33.3%)');
  });

  it('preserves missing and invalid resolution states in series data', () => {
    const option = buildChartOptionFromAggregated(
      [
        {
          id: null,
          name: 'Unclassified',
          resolutionStatus: 'MISSING',
          value: 3,
        },
        {
          id: 'bad-id',
          name: 'Unknown (bad-id)',
          resolutionStatus: 'INVALID',
          value: 2,
        },
      ],
      {
        chartType: 'line',
        dimension: 'defectType',
        id: 'chart-3',
        metric: 'count',
        title: 'Defects',
      },
      METRICS,
    ) as any;

    expect(option.series[0].data).toEqual([
      expect.objectContaining({
        identityKey: 'MISSING:',
        resolutionStatus: 'MISSING',
      }),
      expect.objectContaining({
        id: 'bad-id',
        identityKey: 'INVALID:bad-id',
        resolutionStatus: 'INVALID',
      }),
    ]);
    expect(option.series[0].data[0]).not.toHaveProperty('id');
  });
});
