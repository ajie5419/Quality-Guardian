import { describe, expect, it } from 'vitest';

import {
  buildInspectionRequestEntryProcessOptions,
  buildInspectionRequestEntryRequiredMessage,
  buildInspectionRequestEntryResponsibilityPayload,
  buildInspectionRequestPostSubmitQuery,
  getInspectionRequestResponsibilityTypeOptions,
  getInspectionRequestResponsibilityUnitCopy,
  mapInspectionRequestEntryBomPartOptions,
} from './entry-mode';

describe('inspection request entry identity options', () => {
  it('removes supplier responsibility from PROCESS while preserving INCOMING choices', () => {
    expect(
      getInspectionRequestResponsibilityTypeOptions(false).map(
        (item) => item.value,
      ),
    ).toEqual(['INTERNAL_DEPARTMENT', 'OUTSOURCING_UNIT']);
    expect(
      getInspectionRequestResponsibilityTypeOptions(true).map(
        (item) => item.value,
      ),
    ).toEqual(['INTERNAL_DEPARTMENT', 'SUPPLIER', 'OUTSOURCING_UNIT']);
  });

  it.each([
    [
      'internal',
      {
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-assembly',
        supplierId: 'supplier-stale',
      },
      {
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-assembly',
      },
    ],
    [
      'supplier',
      {
        responsibilityType: 'SUPPLIER',
        responsibleDepartmentId: 'dept-purchasing',
        supplierId: 'supplier-a',
      },
      {
        responsibilityType: 'SUPPLIER',
        responsibleDepartmentId: 'dept-purchasing',
        supplierId: 'supplier-a',
      },
    ],
    [
      'outsourcing',
      {
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartmentId: 'dept-production',
        supplierId: 'supplier-b',
      },
      {
        responsibilityType: 'OUTSOURCING_UNIT',
        supplierId: 'supplier-b',
      },
    ],
  ] as const)(
    'assembles canonical %s request responsibility without name inference',
    (_, input, expected) => {
      expect(buildInspectionRequestEntryResponsibilityPayload(input)).toEqual(
        expected,
      );
    },
  );

  it('allows an internal department without an execution TEAM', () => {
    expect(
      buildInspectionRequestEntryResponsibilityPayload({
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-structure',
        supplierId: '',
      }),
    ).toEqual({
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartmentId: 'dept-structure',
    });
  });

  it('submits outsourcing without a client department ID', () => {
    expect(
      buildInspectionRequestEntryResponsibilityPayload({
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartmentId: '',
        supplierId: 'supplier-outsourcing',
      }),
    ).toEqual({
      responsibilityType: 'OUTSOURCING_UNIT',
      supplierId: 'supplier-outsourcing',
    });
  });

  it('does not describe the optional execution TEAM as a required field', () => {
    expect(
      buildInspectionRequestEntryRequiredMessage(
        {
          attachmentLabel: '自检记录',
          attachmentRequiredMessage: '自检记录不能为空',
          attachmentUploadName: '自检记录',
          componentLabel: '组件名称',
          partLabel: '一级部件名称',
          partPlaceholder: '请选择BOM一级部件',
          processLabel: '工序',
          shellTitle: '扫码报检',
          submitSuccessPrefix: '报检任务已提交',
        },
        false,
        false,
        false,
        'INTERNAL_DEPARTMENT',
      ),
    ).not.toContain('班组');
  });

  it.each([
    ['SUPPLIER', '供应商', '请选择或搜索供应商'],
    ['OUTSOURCING_UNIT', '外协单位', '请选择或搜索外协单位'],
  ] as const)(
    'uses %s unit wording instead of a TEAM label',
    (type, label, placeholder) => {
      expect(getInspectionRequestResponsibilityUnitCopy(type)).toEqual({
        label,
        placeholder,
      });
    },
  );

  it('uses canonical part IDs instead of names or BOM row IDs', () => {
    expect(
      mapInspectionRequestEntryBomPartOptions([
        {
          partId: 'part-1',
          partName: 'Frame',
          partNumber: 'P-001',
        },
        { partId: null, partName: 'Legacy', partNumber: 'P-002' },
      ]),
    ).toEqual([
      {
        label: 'Frame (P-001)',
        partName: 'Frame',
        value: 'part-1',
      },
    ]);
  });

  it('uses process master IDs and does not synthesize name values', () => {
    expect(
      buildInspectionRequestEntryProcessOptions(
        [
          {
            category: 'PROCESS',
            processId: 'process-1',
            processName: 'Welding',
          },
          {
            category: 'INCOMING',
            processId: 'process-2',
            processName: 'Renamed receipt verification',
          },
        ],
        'PROCESS',
      ),
    ).toEqual([
      {
        label: 'Welding',
        processName: 'Welding',
        supplierSource: null,
        value: 'process-1',
      },
    ]);
  });

  it('filters process options by explicit request category', () => {
    expect(
      buildInspectionRequestEntryProcessOptions(
        [
          {
            category: 'PROCESS',
            processId: 'process-1',
            processName: 'Welding',
          },
          {
            category: 'INCOMING',
            processId: 'process-2',
            processName: 'Renamed receipt verification',
          },
        ],
        'INCOMING',
      ),
    ).toEqual([
      {
        label: 'Renamed receipt verification',
        processName: 'Renamed receipt verification',
        supplierSource: null,
        value: 'process-2',
      },
    ]);
  });

  it('keeps the configured supplier source of each process option', () => {
    expect(
      buildInspectionRequestEntryProcessOptions(
        [
          {
            category: 'INCOMING',
            processId: 'process-2',
            processName: '机加成品件',
            supplierSource: 'Outsourcing',
          },
        ],
        'INCOMING',
      ),
    ).toEqual([
      {
        label: '机加成品件',
        processName: '机加成品件',
        supplierSource: 'Outsourcing',
        value: 'process-2',
      },
    ]);
  });

  it('clears identity prefill pairs after a successful submission', () => {
    expect(
      buildInspectionRequestPostSubmitQuery({
        componentName: 'Component A',
        partId: 'part-1',
        partName: 'Frame',
        processId: 'process-1',
        processName: 'Welding',
        reporter: 'Operator',
        team: 'Team A',
        workOrderNumber: 'WO-001',
      }),
    ).toEqual({ workOrderNumber: 'WO-001' });
  });
});
