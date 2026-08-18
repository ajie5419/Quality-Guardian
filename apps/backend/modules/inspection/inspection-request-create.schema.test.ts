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
    responsibilityType: 'INTERNAL_DEPARTMENT',
    responsibleDepartmentId: 'dept-1',
    selfCheckResult: 'PASS',
    stationSelection: { indexes: [1, 2], mode: 'PARTIAL' },
    team: '生产一班',
    teamId: 'team-1',
    workOrderNumber: 'WO-001',
  };
}

describe('inspection request create schema', () => {
  it('accepts V2 identity input without client-controlled names', () => {
    const { team: _team, teamId: _teamId, ...v2Payload } = buildValidPayload();
    const parsed = inspectionRequestCreateV2BodySchema.parse({
      ...v2Payload,
      category: 'PROCESS',
      partId: 'part-1',
      partName: undefined,
      processId: 'process-1',
      processName: undefined,
    });

    expect(validateInspectionRequestCreateV2Body(parsed).isValid).toBe(true);
  });

  it('rejects a V2 request that carries a legacy execution TEAM', () => {
    expect(() =>
      inspectionRequestCreateV2BodySchema.parse({
        ...buildValidPayload(),
        category: 'PROCESS',
        partId: 'part-1',
        processId: 'process-1',
      }),
    ).toThrow('Inspection request teamId is no longer supported');
  });

  it('accepts PROCESS internal responsibility without an execution TEAM', () => {
    const parsed = inspectionRequestCreateV2BodySchema.parse({
      ...buildValidPayload(),
      category: 'PROCESS',
      partId: 'part-1',
      processId: 'process-1',
      team: undefined,
      teamId: undefined,
    });

    expect(validateInspectionRequestCreateV2Body(parsed).isValid).toBe(true);
  });

  it.each(['INCOMING', 'PROCESS'] as const)(
    'accepts %s outsourcing without a client responsibility department',
    (category) => {
      const parsed = inspectionRequestCreateV2BodySchema.parse({
        ...buildValidPayload(),
        category,
        componentName: category === 'INCOMING' ? undefined : '组件A',
        partId: category === 'INCOMING' ? undefined : 'part-1',
        processId: `${category.toLowerCase()}-process-1`,
        requestedPartName:
          category === 'INCOMING' ? 'Unregistered bearing' : undefined,
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartmentId: undefined,
        supplierId: 'supplier-outsourcing',
        team: undefined,
        teamId: undefined,
      });

      expect(validateInspectionRequestCreateV2Body(parsed).isValid).toBe(true);
    },
  );

  it('rejects PROCESS supplier responsibility and all client-selected external departments', () => {
    expect(() =>
      inspectionRequestCreateV2BodySchema.parse({
        ...buildValidPayload(),
        category: 'PROCESS',
        partId: 'part-1',
        processId: 'process-1',
        responsibilityType: 'SUPPLIER',
        supplierId: 'supplier-1',
      }),
    ).toThrow('PROCESS inspection requests cannot use supplier responsibility');
    for (const category of ['INCOMING', 'PROCESS'] as const) {
      const parsed = inspectionRequestCreateV2BodySchema.parse({
        ...buildValidPayload(),
        category,
        componentName: category === 'INCOMING' ? undefined : '组件A',
        partId: category === 'INCOMING' ? undefined : 'part-1',
        processId: `${category.toLowerCase()}-process-1`,
        requestedPartName:
          category === 'INCOMING' ? 'Unregistered bearing' : undefined,
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartmentId: 'dept-client',
        supplierId: 'supplier-outsourcing',
        team: undefined,
        teamId: undefined,
      });
      expect(parsed.responsibleDepartmentId).toBe('dept-client');
    }
  });

  it('rejects a V2 request without canonical IDs', () => {
    expect(() =>
      inspectionRequestCreateV2BodySchema.parse({
        ...buildValidPayload(),
        category: 'PROCESS',
      }),
    ).toThrow();
  });

  it('accepts a public incoming request with a pending material name', () => {
    const parsed = inspectionRequestCreateV2BodySchema.parse({
      ...buildValidPayload(),
      category: 'INCOMING',
      componentName: undefined,
      partId: undefined,
      processId: 'incoming-process-1',
      requestedPartName: 'Unregistered bearing',
      supplierId: 'supplier-1',
      responsibilityType: 'SUPPLIER',
      responsibleDepartmentId: undefined,
      teamId: undefined,
      team: undefined,
    });

    expect(validateInspectionRequestCreateV2Body(parsed).isValid).toBe(true);
  });

  it('rejects INCOMING internal responsibility and client-controlled departments', () => {
    expect(() =>
      inspectionRequestCreateV2BodySchema.parse({
        ...buildValidPayload(),
        category: 'INCOMING',
        componentName: undefined,
        partId: undefined,
        processId: 'incoming-process-1',
        requestedPartName: 'Unregistered bearing',
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-quality',
        supplierId: undefined,
        team: undefined,
        teamId: undefined,
      }),
    ).toThrow(
      'INCOMING inspection requests cannot use internal department responsibility',
    );
    const accepted = inspectionRequestCreateV2BodySchema.parse({
      ...buildValidPayload(),
      category: 'INCOMING',
      componentName: undefined,
      partId: undefined,
      processId: 'incoming-process-1',
      requestedPartName: 'Unregistered bearing',
      responsibilityType: 'SUPPLIER',
      responsibleDepartmentId: 'dept-client',
      supplierId: 'supplier-1',
      team: undefined,
      teamId: undefined,
    });
    expect(accepted.responsibleDepartmentId).toBe('dept-client');
  });

  it('rejects an incoming request with both material identity forms', () => {
    expect(() =>
      inspectionRequestCreateV2BodySchema.parse({
        ...buildValidPayload(),
        category: 'INCOMING',
        partId: 'part-1',
        processId: 'incoming-process-1',
        requestedPartName: 'Unregistered bearing',
        supplierId: 'supplier-1',
        responsibilityType: 'SUPPLIER',
        responsibleDepartmentId: undefined,
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
