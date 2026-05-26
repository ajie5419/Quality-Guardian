import { describe, expect, it } from 'vitest';

import { mapInspectionToPassRateBucket } from './pass-rate-process';

describe('pass-rate process bucket mapping', () => {
  it('maps spray and sand process to 外协涂装', () => {
    expect(
      mapInspectionToPassRateBucket({
        processName: '喷漆',
        team: '结构BU1',
      }),
    ).toBe('外协涂装');
    expect(
      mapInspectionToPassRateBucket({
        processName: '打砂',
        team: '机加BU',
      }),
    ).toBe('外协涂装');
  });

  it('maps specific structure processes to 外协结构 when team is not 结构BU1/结构BU2', () => {
    expect(
      mapInspectionToPassRateBucket({
        processName: '焊接',
        team: '组装BU',
      }),
    ).toBe('外协结构');
    expect(
      mapInspectionToPassRateBucket({
        processName: '整体拼装',
        team: '外协机加',
      }),
    ).toBe('外协结构');
  });

  it('does not force 外协结构 when team is 结构BU1/结构BU2', () => {
    expect(
      mapInspectionToPassRateBucket({
        processName: '焊后尺寸',
        team: '结构BU1',
      }),
    ).toBe('结构BU1');
    expect(
      mapInspectionToPassRateBucket({
        processName: '外观',
        team: '结构BU2',
      }),
    ).toBe('结构BU2');
  });

  it('maps other groups by team name', () => {
    expect(
      mapInspectionToPassRateBucket({
        processName: '随机工序',
        team: '下料BU',
      }),
    ).toBe('下料BU');
    expect(
      mapInspectionToPassRateBucket({
        processName: '随机工序',
        team: '组装BU',
      }),
    ).toBe('组装BU');
    expect(
      mapInspectionToPassRateBucket({
        processName: '随机工序',
        team: '模具 BU',
      }),
    ).toBe('模具 BU');
  });
});
