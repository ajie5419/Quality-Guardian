import { describe, expect, it } from 'vitest';

import {
  buildInspectionRecordPayloadCore,
  formatInspectionStationSelection,
  INCOMING_INSPECTION_PROCESS_NAME,
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  INSPECTION_PROCESS_FALLBACK_ITEMS,
  mergeInspectionProcessNames,
  normalizeInspectionIssueResponsibilityType,
  normalizeInspectionStationSelection,
  resolveInspectionIssueResponsibilityTypeFromDepartment,
  resolveInspectionRequestIssueResponsibility,
} from './inspection-request';

describe('inspection process options', () => {
  it('provides the desktop fallback process values', () => {
    expect(INSPECTION_PROCESS_FALLBACK_ITEMS.map((item) => item.value)).toEqual(
      [
        '外购件',
        '原材料',
        '辅材',
        '机加成品件',
        '下料',
        '组对',
        '焊接',
        '探伤',
        '焊后尺寸',
        '外观',
        '整体拼装',
        '组装',
        '装配',
        '组拼',
        '打砂',
        '喷漆',
      ],
    );
  });

  it('prioritizes work-order processes and removes duplicates', () => {
    expect(
      mergeInspectionProcessNames(
        ['下料', ' 焊接 ', ''],
        INSPECTION_PROCESS_FALLBACK_ITEMS.map((item) => item.value),
      ),
    ).toEqual([
      '下料',
      '焊接',
      '外购件',
      '原材料',
      '辅材',
      '机加成品件',
      '组对',
      '探伤',
      '焊后尺寸',
      '外观',
      '整体拼装',
      '组装',
      '装配',
      '组拼',
      '打砂',
      '喷漆',
    ]);
  });
});

describe('buildInspectionRecordPayloadCore', () => {
  it('builds incoming inspection records for incoming request process', () => {
    const payload = buildInspectionRecordPayloadCore({
      body: {
        attachments: [
          { name: 'close.pdf', url: 'https://example.test/close.pdf' },
        ],
        inspector: 'Inspector A',
        qualifiedQuantity: 8,
        quantity: 10,
        result: 'FAIL',
        unqualifiedQuantity: 2,
      },
      request: {
        attachments: [
          { name: 'self-check.jpg', url: 'https://example.test/self.jpg' },
        ],
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
    expect(JSON.parse(String(payload.documents))).toEqual([
      expect.objectContaining({
        name: 'close.pdf',
        url: 'https://example.test/close.pdf',
      }),
    ]);
    expect(JSON.parse(String(payload.selfCheckDocuments))).toEqual([
      expect.objectContaining({
        name: 'self-check.jpg',
        url: 'https://example.test/self.jpg',
      }),
    ]);
    expect(payload.hasSelfCheckDocuments).toBe(true);
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

describe('resolveInspectionRequestIssueResponsibility', () => {
  it.each([
    ['采购部', INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER],
    ['生产 OBU', INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT],
    ['生产管理部', INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT],
    ['外协质量组', INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT],
  ])(
    'classifies only canonical responsibility department %s',
    (name, expected) => {
      expect(resolveInspectionIssueResponsibilityTypeFromDepartment(name)).toBe(
        expected,
      );
    },
  );

  it('maps incoming supplier to supplierName and purchasing department', () => {
    expect(
      resolveInspectionRequestIssueResponsibility({
        processName: INCOMING_INSPECTION_PROCESS_NAME,
        team: 'Supplier A',
      }),
    ).toEqual({
      responsibilityType: 'SUPPLIER',
      responsibleDepartment: '采购部',
      supplierId: null,
      supplierName: 'Supplier A',
    });
  });

  it('maps outsourcing unit to supplierName and production OBU', () => {
    expect(
      resolveInspectionRequestIssueResponsibility({
        processName: '外协机加',
        team: 'Outsourcing Plant A',
      }),
    ).toEqual({
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartment: '生产 OBU',
      supplierId: null,
      supplierName: 'Outsourcing Plant A',
    });
  });

  it('keeps internal teams as responsible departments', () => {
    expect(
      resolveInspectionRequestIssueResponsibility({
        processName: '焊接',
        team: 'Assembly Team A',
      }),
    ).toEqual({
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartment: 'Assembly Team A',
      supplierId: null,
      supplierName: '',
    });
  });

  it('uses canonical TEAM supplier identity for non-outsourcing process names', () => {
    expect(
      resolveInspectionRequestIssueResponsibility({
        processName: 'Welding',
        team: 'Legacy Team Name',
        teamSupplier: { id: 'supplier-1', name: 'Supplier A' },
      }),
    ).toEqual({
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartment: '生产 OBU',
      supplierId: 'supplier-1',
      supplierName: 'Supplier A',
    });
  });

  it('normalizes only supported responsibility types', () => {
    expect(normalizeInspectionIssueResponsibilityType(' supplier ')).toBe(
      'SUPPLIER',
    );
    expect(normalizeInspectionIssueResponsibilityType('unknown')).toBeNull();
  });
});
