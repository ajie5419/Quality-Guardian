import { describe, expect, it } from 'vitest';

import { getOnlineResolutionDescriptor } from './identity-registry';

describe('identity registry online resolution descriptors', () => {
  it.each([
    ['qms_inspection_requests', 'partId', 'partName'],
    ['quality_records', 'projectId', 'projectName'],
    ['after_sales', 'projectId', 'projectName'],
  ])(
    'maps %s.%s to canonical option key %s',
    (entityType, fieldName, configKey) => {
      expect(getOnlineResolutionDescriptor(entityType, fieldName)).toEqual({
        configKey,
        kind: 'IDENTITY',
        multiple: false,
      });
    },
  );

  it('keeps legacy defect classification out of raw ID resolution', () => {
    expect(
      getOnlineResolutionDescriptor('quality_records', 'defectClassification'),
    ).toEqual({
      kind: 'CLASSIFICATION',
      scope: 'INSPECTION_ISSUE_DEFECT',
    });
  });
});
