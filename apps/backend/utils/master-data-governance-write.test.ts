import { describe, expect, it, vi } from 'vitest';

import { MasterDataGovernanceKernel } from '../core/master-data/governance-kernel';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedInspectionWriteFields,
  buildGovernedWriteFieldsForTable,
} from './master-data-governance-write';

vi.mock('../core/master-data/governance-kernel', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalNameById: vi.fn(),
    resolveCanonicalIdForWrite: vi.fn(),
  },
}));

describe('master-data-governance-write helpers', () => {
  it('supports table-driven governed helper for configurable rollout', () => {
    expect(
      buildGovernedWriteFieldsForTable('inspections', {
        processName: ' 焊接 ',
        projectName: ' 项目A ',
        supplierName: ' 供应商A ',
        team: ' A班 ',
      }),
    ).toEqual({
      processName: '焊接',
      projectName: '项目A',
      supplierName: '供应商A',
      team: 'A班',
    });
  });

  it('keeps specialized helper compatibility for existing callers', () => {
    expect(
      buildGovernedInspectionWriteFields({
        processName: ' 焊接 ',
        team: ' A班 ',
      }),
    ).toEqual({
      processName: '焊接',
      team: 'A班',
    });
  });

  it('throws for unknown governed table', () => {
    expect(() =>
      buildGovernedWriteFieldsForTable('unknown_table', {
        anyField: 'value',
      }),
    ).toThrow('UNKNOWN_GOVERNED_TARGET_TABLE:unknown_table');
  });

  it('normalizes inspection team field', () => {
    expect(
      buildGovernedWriteFieldsForTable('inspections', {
        processName: ' 焊接 ',
        projectName: ' 项目A ',
        team: '  A班  ',
        supplierName: '  供应商A ',
      }),
    ).toEqual({
      processName: '焊接',
      projectName: '项目A',
      team: 'A班',
      supplierName: '供应商A',
    });
    expect(
      buildGovernedWriteFieldsForTable('inspections', { team: '' }),
    ).toEqual({
      team: null,
    });
  });

  it('normalizes quality record wave1 fields', () => {
    expect(
      buildGovernedWriteFieldsForTable('quality_records', {
        defectType: '  焊接缺陷 ',
        defectSubtype: ' 气孔 ',
        division: ' 车辆 ',
        partName: '  部件A ',
        processName: '  焊接 ',
        projectName: '  项目A ',
        category: '  PROCESS ',
        rootCause: '  焊缝污染 ',
        responsibleDepartment: ' 生产 OBU ',
        supplierName: ' 供应商B ',
      }),
    ).toEqual({
      defectType: '焊接缺陷',
      defectSubtype: '气孔',
      division: '车辆',
      partName: '部件A',
      processName: '焊接',
      projectName: '项目A',
      category: 'PROCESS',
      rootCause: '焊缝污染',
      responsibleDepartment: '生产 OBU',
      supplierName: '供应商B',
    });
  });

  it('normalizes inspection request team field', () => {
    expect(
      buildGovernedWriteFieldsForTable('qms_inspection_requests', {
        partName: '  部件B ',
        processName: ' 装配 ',
        team: '  总装一班 ',
      }),
    ).toEqual({
      partName: '部件B',
      processName: '装配',
      team: '总装一班',
    });
  });

  it('normalizes inspection incomingType/materialName and request componentName', () => {
    expect(
      buildGovernedWriteFieldsForTable('inspections', {
        incomingType: '  外购件 ',
        materialName: '  泵体 ',
      }),
    ).toEqual({
      incomingType: '外购件',
      materialName: '泵体',
    });

    expect(
      buildGovernedWriteFieldsForTable('qms_inspection_requests', {
        componentName: '  连接器组件 ',
      }),
    ).toEqual({
      componentName: '连接器组件',
    });
  });

  it('keeps undefined fields untouched', () => {
    expect(buildGovernedWriteFieldsForTable('quality_records', {})).toEqual({});
    expect(buildGovernedWriteFieldsForTable('inspections', {})).toEqual({});
  });

  it('normalizes work order division', () => {
    expect(
      buildGovernedWriteFieldsForTable('work_orders', {
        division: ' 车辆 SOBU ',
        projectName: '  项目B ',
      }),
    ).toEqual({
      division: '车辆 SOBU',
      projectName: '项目B',
    });
  });

  it('normalizes after sales wave1 fields', () => {
    expect(
      buildGovernedWriteFieldsForTable('after_sales', {
        defectType: ' 制造缺陷 ',
        defectSubtype: ' 焊接不良 ',
        productType: ' 车辆产品 ',
        productSubtype: ' 平板车 ',
        failureType: '  电气故障 ',
        failureCause: '  接触不良 ',
        division: ' 车辆 ',
        partName: '  部件C ',
        projectName: '  项目C ',
        respDept: ' 质量部 ',
        feedbackDept: '  质量管理部  ',
        supplierBrand: '  品牌X ',
      }),
    ).toEqual({
      defectType: '制造缺陷',
      defectSubtype: '焊接不良',
      productType: '车辆产品',
      productSubtype: '平板车',
      failureType: '电气故障',
      failureCause: '接触不良',
      division: '车辆',
      partName: '部件C',
      projectName: '项目C',
      respDept: '质量部',
      feedbackDept: '质量管理部',
      supplierBrand: '品牌X',
    });
  });

  it('normalizes supervision project supplier and vehicle department', () => {
    expect(
      buildGovernedWriteFieldsForTable('supervision_projects', {
        projectName: '  项目D ',
        supplierName: '  供应商C ',
      }),
    ).toEqual({
      projectName: '项目D',
      supplierName: '供应商C',
    });

    expect(
      buildGovernedWriteFieldsForTable('vehicle_commissioning_issues', {
        partName: '  部件D ',
        projectName: '  项目E ',
        responsibleDepartment: ' 调试一组 ',
      }),
    ).toEqual({
      partName: '部件D',
      projectName: '项目E',
      responsibleDepartment: '调试一组',
    });
  });

  it('normalizes quality loss and metrology borrow department aliases', () => {
    expect(
      buildGovernedWriteFieldsForTable('quality_losses', {
        type: '  外部损失 ',
        respDept: ' 质量一科 ',
      }),
    ).toEqual({
      type: '外部损失',
      respDept: '质量一科',
    });

    expect(
      buildGovernedWriteFieldsForTable('metrology_borrow_records', {
        borrowerDepartment: ' 生产 OBU ',
      }),
    ).toEqual({
      borrowerDepartment: '生产 OBU',
    });
  });

  it('normalizes welder team field', () => {
    expect(
      buildGovernedWriteFieldsForTable('welders', {
        team: '  焊接二班 ',
      }),
    ).toEqual({
      team: '焊接二班',
    });
  });

  it('supports name-only governed fields for users/roles tables', () => {
    expect(
      buildGovernedWriteFieldsForTable('users', {
        username: '  alice ',
        realName: '  Alice Zhang ',
        department: '  dept-001 ',
      }),
    ).toEqual({
      username: 'alice',
      realName: 'Alice Zhang',
      department: 'dept-001',
    });

    expect(
      buildGovernedWriteFieldsForTable('roles', {
        name: '  qa_admin ',
      }),
    ).toEqual({
      name: 'qa_admin',
    });
  });

  it('normalizes inspection form template fields', () => {
    expect(
      buildGovernedWriteFieldsForTable('inspection_form_templates', {
        formName: '  焊缝检验表 ',
        partName: '  部件A ',
        processName: ' 装配 ',
        projectName: ' 项目B ',
      }),
    ).toEqual({
      formName: '焊缝检验表',
      partName: '部件A',
      processName: '装配',
      projectName: '项目B',
    });
  });

  it('normalizes work order requirement fields', () => {
    expect(
      buildGovernedWriteFieldsForTable('work_order_requirements', {
        partName: '  部件B ',
        processName: ' 焊接 ',
      }),
    ).toEqual({
      partName: '部件B',
      processName: '焊接',
    });
  });

  it('normalizes project bom snake_case part_name field', () => {
    expect(
      buildGovernedWriteFieldsForTable('project_boms', {
        part_name: '  车钩总成 ',
      }),
    ).toEqual({
      part_name: '车钩总成',
    });
  });

  it('normalizes project bom part_number and required_processes fields', () => {
    expect(
      buildGovernedWriteFieldsForTable('project_boms', {
        part_number: '  PN-001 ',
        required_processes: '  ["焊接","装配"] ',
      }),
    ).toEqual({
      part_number: 'PN-001',
      required_processes: '["焊接","装配"]',
    });
  });

  it('normalizes standard-document fields', () => {
    expect(
      buildGovernedWriteFieldsForTable('standard_documents', {
        category: '  工艺规范 ',
      }),
    ).toEqual({
      category: '工艺规范',
    });
  });

  it('normalizes work order requirement name/team and metrology borrowerName', () => {
    expect(
      buildGovernedWriteFieldsForTable('work_order_requirements', {
        requirementName: '  焊缝外观检查 ',
        responsibleTeam: '  焊接一班 ',
      }),
    ).toEqual({
      requirementName: '焊缝外观检查',
      responsibleTeam: '焊接一班',
    });

    expect(
      buildGovernedWriteFieldsForTable('metrology_borrow_records', {
        borrowerName: '  张三 ',
      }),
    ).toEqual({
      borrowerName: '张三',
    });
  });

  it('normalizes inspection archive task projectName', () => {
    expect(
      buildGovernedWriteFieldsForTable('inspection_archive_tasks', {
        projectName: ' 项目C ',
      }),
    ).toEqual({
      projectName: '项目C',
    });
  });

  it('normalizes supplier category field', () => {
    expect(
      buildGovernedWriteFieldsForTable('suppliers', {
        category: '  Outsourcing ',
      }),
    ).toEqual({
      category: 'Outsourcing',
    });
  });

  it('normalizes supplier name/product/project fields', () => {
    expect(
      buildGovernedWriteFieldsForTable('suppliers', {
        name: '  供应商A ',
        productName: '  产品B ',
        project: '  项目C ',
      }),
    ).toEqual({
      name: '供应商A',
      productName: '产品B',
      project: '项目C',
    });
  });

  it('normalizes quality plan customer and task dispatch type fields', () => {
    expect(
      buildGovernedWriteFieldsForTable('quality_plans', {
        customer: '  CRRC ',
        projectName: '  城轨项目 ',
      }),
    ).toEqual({
      customer: 'CRRC',
      projectName: '城轨项目',
    });

    expect(
      buildGovernedWriteFieldsForTable('qms_task_dispatches', {
        type: '  ITP_INSPECTION ',
      }),
    ).toEqual({
      type: 'ITP_INSPECTION',
    });
  });

  it('normalizes dfmea cause, itp processStep and instrument name', () => {
    expect(
      buildGovernedWriteFieldsForTable('dfmea', {
        cause: '  焊缝污染 ',
      }),
    ).toEqual({
      cause: '焊缝污染',
    });

    expect(
      buildGovernedWriteFieldsForTable('itp_items', {
        processStep: '  组对 ',
      }),
    ).toEqual({
      processStep: '组对',
    });

    expect(
      buildGovernedWriteFieldsForTable('measuring_instruments', {
        instrumentName: '  游标卡尺 ',
      }),
    ).toEqual({
      instrumentName: '游标卡尺',
    });
  });

  it('normalizes supervision issue/task fields', () => {
    expect(
      buildGovernedWriteFieldsForTable('supervision_issues', {
        issueType: '  quality ',
      }),
    ).toEqual({
      issueType: 'quality',
    });

    expect(
      buildGovernedWriteFieldsForTable('supervision_issue_actions', {
        actionType: '  follow_up ',
      }),
    ).toEqual({
      actionType: 'follow_up',
    });

    expect(
      buildGovernedWriteFieldsForTable('supervision_projects', {
        projectType: '  MOLD ',
      }),
    ).toEqual({
      projectType: 'MOLD',
    });
  });

  it('builds canonical id write pair via registry for quality records', async () => {
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalIdForWrite,
    ).mockImplementation(async (options) => {
      if (options.configKey === 'defectType') return 'dict-defect-type';
      if (options.configKey === 'defectSubtype') return 'dict-defect-subtype';
      return undefined;
    });

    await expect(
      buildGovernedCanonicalWritePairForTable('quality_records', {
        defectType: '焊接缺陷',
        defectSubtype: '气孔',
      }),
    ).resolves.toEqual({
      defectTypeId: 'dict-defect-type',
      defectSubtypeId: 'dict-defect-subtype',
    });
  });

  it('builds canonical id write pair for responsibleTeam/supplierProductName/supplierProject/rootCause', async () => {
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNameById,
    ).mockResolvedValue(null);
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalIdForWrite,
    ).mockImplementation(async (options) => {
      if (options.configKey === 'responsibleTeam') return 'team-001';
      if (options.configKey === 'supplierProductName')
        return 'supplier-product-001';
      if (options.configKey === 'supplierProject')
        return 'supplier-project-001';
      if (options.configKey === 'rootCause') return 'root-cause-001';
      return undefined;
    });

    await expect(
      buildGovernedCanonicalWritePairForTable('work_order_requirements', {
        responsibleTeam: '焊接一班',
      }),
    ).resolves.toEqual({
      responsibleTeamId: 'team-001',
    });

    await expect(
      buildGovernedCanonicalWritePairForTable('suppliers', {
        productName: '车轴总成',
        project: '城轨项目',
      }),
    ).resolves.toEqual({
      productNameId: 'supplier-product-001',
      projectId: 'supplier-project-001',
    });

    await expect(
      buildGovernedCanonicalWritePairForTable('quality_records', {
        rootCause: '焊缝污染',
      }),
    ).resolves.toEqual({
      rootCauseId: 'root-cause-001',
    });
  });

  it('builds canonical id write pair for duplicated target-table mappings', async () => {
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNameById,
    ).mockResolvedValue(null);
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalIdForWrite,
    ).mockImplementation(async (options) => {
      if (
        options.configKey === 'responsibleDepartment' &&
        typeof options.name === 'string' &&
        options.name.length > 0
      ) {
        return 'dept-001';
      }
      if (options.configKey === 'supplierBrand' && options.name === '品牌X') {
        return 'supplier-brand-001';
      }
      if (options.configKey === 'borrowerName' && options.name === '张三') {
        return 'borrower-001';
      }
      return undefined;
    });

    await expect(
      buildGovernedCanonicalWritePairForTable('after_sales', {
        respDept: '质量部',
        feedbackDept: '质量管理部',
      }),
    ).resolves.toEqual({
      respDeptId: 'dept-001',
      feedbackDeptId: 'dept-001',
    });

    await expect(
      buildGovernedCanonicalWritePairForTable('after_sales', {
        supplierBrand: '品牌X',
      }),
    ).resolves.toEqual({
      supplierBrandId: 'supplier-brand-001',
    });

    await expect(
      buildGovernedCanonicalWritePairForTable('metrology_borrow_records', {
        borrowerName: '张三',
      }),
    ).resolves.toEqual({
      borrowerNameId: 'borrower-001',
    });
  });

  it('canonicalizes mistaken id value written into name field', async () => {
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNameById,
    ).mockImplementation(async (options) => {
      if (
        options.configKey === 'responsibleDepartment' &&
        options.canonicalId === 'dept-123'
      ) {
        return '质量部';
      }
      return null;
    });
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalIdForWrite,
    ).mockImplementation(async (options) => {
      if (options.configKey === 'responsibleDepartment') return 'dept-123';
      return undefined;
    });

    await expect(
      buildGovernedCanonicalWritePairForTable('quality_records', {
        responsibleDepartment: 'dept-123',
      }),
    ).resolves.toEqual({
      responsibleDepartment: '质量部',
      responsibleDepartmentId: 'dept-123',
    });
  });
});
