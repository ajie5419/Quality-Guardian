import { describe, expect, it } from 'vitest';

import {
  INCOMING_INSPECTION_PROCESS_NAME,
  inspectionRequestCreateBodySchema,
  inspectionRequestCreateV2BodySchema,
  validateInspectionRequestCreateBody,
  validateInspectionRequestCreateV2Body,
} from './inspection-request-create.schema';

function buildValidPayload() {
  return {
    attachments: [
      { name: 'self-check.jpg', url: 'https://example.test/a.jpg' },
    ],
    componentName: '组件A',
    mutualCheckResult: 'PASS',
    partName: '一级部件',
    processName: '焊接',
    quantity: '2',
    reporter: '张三',
    selfCheckResult: 'PASS',
    stationSelection: { indexes: [1, 2], mode: 'PARTIAL' },
    team: '生产一班',
    teamId: 'team-1',
    workOrderNumber: 'WO-001',
  };
}

describe('inspection request create schema', () => {
  it('accepts V2 identity input without client-controlled names', () => {
    const parsed = inspectionRequestCreateV2BodySchema.parse({
      ...buildValidPayload(),
      category: 'PROCESS',
      partId: 'part-1',
      partName: undefined,
      processId: 'process-1',
      processName: undefined,
    });

    expect(validateInspectionRequestCreateV2Body(parsed).isValid).toBe(true);
  });

  it('rejects a V2 request without canonical IDs', () => {
    expect(() =>
      inspectionRequestCreateV2BodySchema.parse({
        ...buildValidPayload(),
        category: 'PROCESS',
      }),
    ).toThrow();
  });

  it('accepts the current create payload shape', () => {
    const parsed = inspectionRequestCreateBodySchema.parse(buildValidPayload());
    const validation = validateInspectionRequestCreateBody(parsed);

    expect(validation.isValid).toBe(true);
    expect(validation.attachments).toEqual([
      {
        name: 'self-check.jpg',
        size: 0,
        type: '',
        url: 'https://example.test/a.jpg',
      },
    ]);
    expect(validation.workOrderNumber).toBe('WO-001');
  });

  it('accepts multiple work order numbers and keeps the first as primary', () => {
    const parsed = inspectionRequestCreateBodySchema.parse({
      ...buildValidPayload(),
      workOrderNumber: '',
      workOrderNumbers: ['WO-001', 'WO-002', 'WO-001'],
    });
    const validation = validateInspectionRequestCreateBody(parsed);

    expect(validation.isValid).toBe(true);
    expect(validation.workOrderNumber).toBe('WO-001');
    expect(validation.workOrderNumbers).toEqual(['WO-001', 'WO-002']);
  });

  it('requires componentName for non-assembly process', () => {
    const parsed = inspectionRequestCreateBodySchema.parse({
      ...buildValidPayload(),
      componentName: '',
    });

    expect(validateInspectionRequestCreateBody(parsed).isValid).toBe(false);
  });

  it('allows empty componentName for assembly process', () => {
    const parsed = inspectionRequestCreateBodySchema.parse({
      ...buildValidPayload(),
      componentName: '',
      processName: '总装组装',
    });

    expect(validateInspectionRequestCreateBody(parsed).isValid).toBe(true);
  });

  it('allows empty componentName for incoming inspection process', () => {
    const parsed = inspectionRequestCreateBodySchema.parse({
      ...buildValidPayload(),
      componentName: '',
      processName: INCOMING_INSPECTION_PROCESS_NAME,
      supplierId: 'supplier-1',
      team: '供应商A',
    });

    const validation = validateInspectionRequestCreateBody(parsed);

    expect(validation.isValid).toBe(true);
    expect(validation.componentName).toBe('');
    expect(validation.processName).toBe(INCOMING_INSPECTION_PROCESS_NAME);
  });
});
