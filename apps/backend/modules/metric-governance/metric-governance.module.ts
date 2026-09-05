import type { ModuleDeclaration } from '~/utils/module-types';

export const metricGovernanceModule: ModuleDeclaration = {
  audit: {
    activate: {
      action: 'UPDATE',
      detailsTemplate:
        'Activate metric {{metricCode}} v{{version}} by {{actor}}; reason: {{changeReason}}; before: {{before}}; after: {{after}}',
      targetType: 'metric_definitions',
    },
    create: {
      action: 'CREATE',
      detailsTemplate:
        'Create metric {{metricCode}} v{{version}} by {{actor}}; reason: {{changeReason}}; after: {{after}}',
      targetType: 'metric_definitions',
    },
    deprecate: {
      action: 'UPDATE',
      detailsTemplate:
        'Deprecate metric {{metricCode}} v{{version}} by {{actor}}; reason: {{changeReason}}; before: {{before}}; after: {{after}}',
      targetType: 'metric_definitions',
    },
    newVersion: {
      action: 'CREATE',
      detailsTemplate:
        'Create metric version {{metricCode}} v{{version}} by {{actor}}; reason: {{changeReason}}; before: {{before}}; after: {{after}}',
      targetType: 'metric_definition_versions',
    },
    ownerChange: {
      action: 'UPDATE',
      detailsTemplate:
        'Change owner for metric {{metricCode}} v{{version}} by {{actor}}; reason: {{changeReason}}; before: {{before}}; after: {{after}}',
      targetType: 'metric_definitions',
    },
    updateDraft: {
      action: 'UPDATE',
      detailsTemplate:
        'Update draft metric {{metricCode}} v{{version}} by {{actor}}; reason: {{changeReason}}; before: {{before}}; after: {{after}}',
      targetType: 'metric_definitions',
    },
  },
  name: 'metric-governance',
};
