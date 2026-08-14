import type {
  InspectionRequestAttachment,
  InspectionRequestCheckResult,
} from '@qgs/shared';
import type { UploadFile } from 'ant-design-vue';

import type { RouteLocationNormalizedLoaded } from 'vue-router';

import { computed, reactive, ref } from 'vue';

import { describe, expect, it } from 'vitest';

import { useInspectionRequestEntryFormState } from './useInspectionRequestEntryFormState';

function createRequestForm() {
  return reactive({
    attachments: [] as InspectionRequestAttachment[],
    componentName: '',
    incomingType: '',
    mutualCheckResult: 'PASS' as InspectionRequestCheckResult,
    partId: '',
    partName: '',
    processId: '',
    processName: '',
    quantity: 1,
    reporter: '',
    requestedPartName: '',
    requestInfo: '',
    requestNewPart: false,
    responsibilityType: 'INTERNAL_DEPARTMENT' as const,
    responsibleDepartmentId: 'dept-stale',
    selfCheckResult: 'PASS' as InspectionRequestCheckResult,
    stationSelection: null,
    supplierId: 'supplier-stale',
    workOrderNumber: '',
    workOrderNumbers: [],
  });
}

describe('inspection request entry form state', () => {
  it('initializes incoming entries as supplier responsibility before options load', () => {
    const requestForm = createRequestForm();
    const { applyRoutePrefill } = useInspectionRequestEntryFormState({
      attachmentFileList: ref<UploadFile[]>([]),
      clearResponsibilityIdentity: () => {
        requestForm.responsibleDepartmentId = '';
        requestForm.supplierId = '';
      },
      incomingMaterialFreeInputEnabled: ref(false),
      isIncomingEntry: computed(() => true),
      requestForm,
      route: {
        query: {
          partId: 'part-1',
          partName: 'Incoming part',
          reporter: 'Reporter',
          workOrderNumber: 'WO-001',
        },
      } as unknown as RouteLocationNormalizedLoaded,
    });

    applyRoutePrefill();

    expect(requestForm).toMatchObject({
      responsibilityType: 'SUPPLIER',
      responsibleDepartmentId: '',
      supplierId: '',
      workOrderNumber: 'WO-001',
      workOrderNumbers: ['WO-001'],
    });
  });
});
