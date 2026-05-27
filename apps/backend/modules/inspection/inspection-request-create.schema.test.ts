import { describe, expect, it } from 'vitest';

import {
  inspectionRequestCreateBodySchema,
  validateInspectionRequestCreateBody,
} from './inspection-request-create.schema';

function buildValidPayload() {
  return {
    attachments: [{ name: 'self-check.jpg', url: 'https://example.test/a.jpg' }],
    componentName: '组件A',
    mutualCheckResult: 'PASS',
    partName: '一级部件',
    processName: '焊接',
    quantity: '2',
    reporter: '张三',
    selfCheckResult: 'PASS',
    team: '生产一班',
    workOrderNumber: 'WO-001',
  };
}

describe('inspection request create schema', () => {
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
});
