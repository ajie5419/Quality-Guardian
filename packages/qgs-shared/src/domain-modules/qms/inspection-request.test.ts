import { describe, expect, it } from 'vitest';

import {
  buildInspectionRecordPayloadCore,
  INCOMING_INSPECTION_PROCESS_NAME,
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
      supplierName: 'Supplier A',
      unqualifiedQuantity: 2,
      workOrderNumber: 'WO-001',
    });
    expect(payload).not.toHaveProperty('processName');
    expect(payload).not.toHaveProperty('level1Component');
  });
});
