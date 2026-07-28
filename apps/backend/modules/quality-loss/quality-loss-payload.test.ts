import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';

import {
  buildQualityLossCreateData,
  buildQualityLossCreateResponse,
  createQualityLossId,
} from './quality-loss-payload';

describe('quality-loss payload utils', () => {
  it('creates quality loss id with year prefix', () => {
    const id = createQualityLossId(new Date('2026-01-01T00:00:00.000Z'));
    expect(id.startsWith('QL-2026-')).toBe(true);
  });

  it('builds create data with normalized defaults', () => {
    const data = buildQualityLossCreateData(
      {
        actualClaim: 'abc',
        amount: '100.5',
        date: 'invalid',
        description: 'desc',
        partId: 'part-1',
        partName: '主梁',
        projectId: 'project-1',
        projectName: '1000t 架桥机',
        responsibleDepartment: 'QA',
        responsibleDepartmentId: 'dept-qa',
        status: 'completed',
        type: 'Process',
        workOrderNumber: 'WO-468624',
      },
      'QL-2026-AAAAAA',
    );

    expect(data.lossId).toBe('QL-2026-AAAAAA');
    expect(data.amount).toBe(100.5);
    expect(data.actualClaim).toBe(0);
    expect(data.status).toBe('Confirmed');
    expect(data.respDept).toBe('QA');
    expect(data.respDeptId).toBe('dept-qa');
    expect(data.type).toBe('Process');
    expect(data).toEqual(
      expect.objectContaining({
        partId: 'part-1',
        partName: '主梁',
        projectId: 'project-1',
        projectName: '1000t 架桥机',
        workOrderNumber: 'WO-468624',
      }),
    );
    expect(data.occurDate).toBeInstanceOf(Date);
  });

  it('defaults unknown status without treating it as valid input', () => {
    const data = buildQualityLossCreateData(
      {
        status: 'unexpected-status',
      },
      'QL-2026-BBBBBB',
    );

    expect(data.status).toBe('Pending');
  });

  it('builds response with mapped fields', () => {
    const response = buildQualityLossCreateResponse({
      actualClaim: new Decimal(20),
      amount: new Decimal(100),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: null,
      description: '',
      id: 'cuid-1',
      isDeleted: false,
      lossId: 'QL-2026-ABC123',
      occurDate: new Date('2026-01-02T00:00:00.000Z'),
      partId: null,
      partName: null,
      projectId: null,
      projectName: null,
      respDept: 'QA',
      respDeptId: 'dept-qa',
      status: 'Pending',
      type: 'Process',
      typeId: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      workOrderNumber: null,
    });

    expect(response.id).toBe('QL-2026-ABC123');
    expect(response.date).toBe('2026-01-02');
    expect(response.responsibleDepartment).toBe('QA');
  });
});
