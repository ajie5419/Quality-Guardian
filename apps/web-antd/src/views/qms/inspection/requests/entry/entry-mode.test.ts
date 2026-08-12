import { describe, expect, it } from 'vitest';

import {
  buildInspectionRequestEntryProcessOptions,
  buildInspectionRequestEntryRequiredMessage,
  buildInspectionRequestEntryResponsibilityPayload,
  buildInspectionRequestPostSubmitQuery,
  getInspectionRequestResponsibilityUnitCopy,
  mapInspectionRequestEntryBomPartOptions,
  mapInspectionRequestEntryTeamOptions,
} from './entry-mode';

describe('inspection request entry identity options', () => {
  it.each([
    [
      'internal',
      {
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-assembly',
        supplierId: 'supplier-stale',
        teamId: 'team-assembly',
        teamResponsibleDepartmentId: 'dept-assembly',
      },
      {
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-assembly',
        teamId: 'team-assembly',
      },
    ],
    [
      'supplier',
      {
        responsibilityType: 'SUPPLIER',
        responsibleDepartmentId: 'dept-purchasing',
        supplierId: 'supplier-a',
        teamId: 'team-stale',
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
        teamId: 'team-stale',
      },
      {
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartmentId: 'dept-production',
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
        teamId: '',
      }),
    ).toEqual({
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartmentId: 'dept-structure',
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
          teamLabel: '班组',
          teamPlaceholder: '请选择班组',
        },
        false,
        false,
        false,
        'INTERNAL_DEPARTMENT',
      ),
    ).not.toContain('班组');
  });

  it('rejects an execution TEAM assigned to a different department', () => {
    expect(
      buildInspectionRequestEntryResponsibilityPayload({
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-structure',
        supplierId: '',
        teamId: 'team-assembly',
        teamResponsibleDepartmentId: 'dept-assembly',
      }),
    ).toBeNull();
  });

  it('keeps canonical TEAM IDs as selector values', () => {
    expect(
      mapInspectionRequestEntryTeamOptions([
        { group: 'internal', label: 'Internal Team', value: 'team-1' },
        { group: 'external', label: 'Resident Team', value: 'team-2' },
      ]),
    ).toEqual([
      {
        label: '内部生产车间',
        options: [{ label: 'Internal Team', value: 'team-1' }],
      },
      {
        label: '外协加工单位',
        options: [{ label: 'Resident Team', value: 'team-2' }],
      },
    ]);
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

  it('retains unresolved TEAMs as disabled options with their canonical IDs and reasons', () => {
    expect(
      mapInspectionRequestEntryTeamOptions([
        {
          group: 'unresolved',
          label: 'Conflicted Team',
          reason: 'CONFLICTING_TEAM_SOURCES',
          value: 'team-conflicted',
        },
      ]),
    ).toEqual([
      {
        label: '待治理班组（不可选）',
        options: [
          {
            disabled: true,
            label: 'Conflicted Team（同时存在内部部门和供应商来源）',
            title: '同时存在内部部门和供应商来源',
            value: 'team-conflicted',
          },
        ],
      },
    ]);
  });

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
