import { describe, expect, it } from 'vitest';

import {
  buildInspectionRecordPayloadCore,
  formatInspectionStationSelection,
  INCOMING_INSPECTION_PROCESS_NAME,
  normalizeInspectionStationSelection,
} from './inspection-request';

describe('buildInspectionRecordPayloadCore', () => {
  it('builds incoming inspection records for incoming request process', () => {
    const payload = buildInspectionRecordPayloadCore({
      body: {
        attachments: [
          { name: 'incoming.jpg', url: 'https://example.test/i.jpg' },
        ],
        inspector: 'Inspector A',
        qualifiedQuantity: 8,
        quantity: 10,
        result: 'FAIL',
        unqualifiedQuantity: 2,
      },
      request: {
        componentName: '',
        mutualCheckResult: 'PASS',
        partName: 'Bearing',
        processName: INCOMING_INSPECTION_PROCESS_NAME,
        quantity: 10,
        reporter: 'Reporter A',
        requestInfo: JSON.stringify({
          incomingType: '外购件',
          notes: 'Incoming batch',
        }),
        selfCheckResult: 'PASS',
        stationSelection: JSON.stringify({ indexes: [1, 2], mode: 'PARTIAL' }),
        team: 'Supplier A',
        work_order: { projectName: 'Project A' },
        workOrderNumber: 'WO-001',
      },
    });

    expect(payload).toMatchObject({
      category: 'INCOMING',
      incomingType: '外购件',
      materialName: 'Bearing',
      projectName: 'Project A',
      qualifiedQuantity: 8,
      quantity: 10,
      result: 'FAIL',
      stationSelection: JSON.stringify({ indexes: [1, 2], mode: 'PARTIAL' }),
      supplierName: 'Supplier A',
      unqualifiedQuantity: 2,
      workOrderNumber: 'WO-001',
    });
    expect(payload).not.toHaveProperty('processName');
    expect(payload).not.toHaveProperty('level1Component');
  });
});

describe('inspection station selection', () => {
  it('normalizes partial station indexes within quantity bounds', () => {
    expect(
      normalizeInspectionStationSelection(
        { indexes: [2, '1', 99, 2], mode: 'partial' },
        3,
      ),
    ).toEqual({ indexes: [1, 2, 3], mode: 'PARTIAL' });
  });

  it('formats all and partial selections', () => {
    expect(formatInspectionStationSelection({ indexes: [], mode: 'ALL' })).toBe(
      '全部台数',
    );
    expect(
      formatInspectionStationSelection({ indexes: [1, 2], mode: 'PARTIAL' }),
    ).toBe('第 1 台、第 2 台');
  });
});
