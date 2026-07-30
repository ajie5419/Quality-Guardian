import type { InspectionRequest } from '@qgs/shared';

import { ref } from 'vue';

import { describe, expect, it } from 'vitest';

import { useInspectionRequestPresentation } from './useInspectionRequestPresentation';

function createRequest(
  overrides: Partial<InspectionRequest> = {},
): InspectionRequest {
  return {
    createdAt: '2026-07-30T00:00:00.000Z',
    id: 'request-1',
    mutualCheckResult: 'PASS',
    partName: 'Frame',
    priority: 3,
    processName: 'Incoming Inspection',
    quantity: 1,
    reporter: 'Reporter',
    requestNo: 'REQ-1',
    selfCheckResult: 'PASS',
    status: 'SUBMITTED',
    submittedAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    workOrderNumber: 'WO-1',
    dispatchBlockedReason: null,
    ...overrides,
  };
}

describe('inspection request material approval presentation', () => {
  const presentation = useInspectionRequestPresentation({
    canDelete: ref(true),
    checkResultOptions: [],
    requestStats: ref({ inspectorStatus: [] }),
  });

  it('disables dispatch and explains a pending material approval', () => {
    const request = createRequest({
      dispatchBlockedReason: 'MATERIAL_APPROVAL_PENDING',
    });

    expect(presentation.canShowDispatchAction(request)).toBe(true);
    expect(presentation.isDispatchable(request)).toBe(false);
  });

  it('enables dispatch immediately after approval', () => {
    const request = createRequest();

    expect(presentation.isDispatchable(request)).toBe(true);
  });
});
