import type { ModuleDeclaration } from '~/utils/module-types';

import { AUDIT_TEMPLATES } from '@qgs/shared';

export const qualityLossModule: ModuleDeclaration = {
  name: 'quality-loss',
  dataScope: {
    deptFields: ['respDept'],
    selfFields: ['createdBy'],
    selfFallsBackToDept: true,
  },
  audit: {
    create: {
      action: 'CREATE',
      targetType: 'quality_loss',
      detailsTemplate: '新增质量损失记录: {{type}} ({{amount}})',
    },
    relatedUpdate: {
      action: 'UPDATE',
      detailsTemplate: '修改质量损失相关记录: {{id}}{{sourcePart}}',
    },
    delete: {
      action: 'DELETE',
      targetType: 'quality_loss',
      detailsTemplate: AUDIT_TEMPLATES.QUALITY_LOSS_SOFT_DELETE,
    },
    batchDelete: {
      action: 'DELETE',
      targetType: 'quality_loss',
      detailsTemplate: AUDIT_TEMPLATES.QUALITY_LOSS_BATCH_SOFT_DELETE,
    },
  },
};
