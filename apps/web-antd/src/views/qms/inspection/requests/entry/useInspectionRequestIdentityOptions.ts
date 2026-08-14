import type {
  InspectionIssueResponsibilityType,
  InspectionRequestResponsibilityDepartmentOption,
  InspectionRequestResponsibilitySupplierOption,
} from '@qgs/shared';

import { ref } from 'vue';

import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  resolveInspectionRequestResponsibilityDepartmentDefault,
} from '@qgs/shared';

import { getPublicInspectionRequestResponsibilityOptions } from '#/api/qms/inspection-request';
import { useErrorHandler } from '#/hooks/useErrorHandler';

interface InspectionRequestIdentityForm {
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  supplierId: string;
}

function isExternalResponsibility(
  responsibilityType: InspectionIssueResponsibilityType,
) {
  return (
    responsibilityType === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER ||
    responsibilityType === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
  );
}

/**
 * Request entry obtains its department and supplier choices from one server
 * policy endpoint. This keeps the responsibility ID authoritative instead of
 * recreating it from TEAM or supplier display names in either client.
 */
export function useInspectionRequestIdentityOptions(options: {
  requestForm: InspectionRequestIdentityForm;
}) {
  const { requestForm } = options;
  const { handleApiError } = useErrorHandler();
  const responsibilityLoading = ref(false);
  const responsibilityDepartmentOptions = ref<
    InspectionRequestResponsibilityDepartmentOption[]
  >([]);
  const supplierOptions = ref<InspectionRequestResponsibilitySupplierOption[]>(
    [],
  );

  function clearResponsibilityIdentity() {
    requestForm.responsibleDepartmentId = '';
    requestForm.supplierId = '';
  }

  function preserveSelectedOption<T extends { value: string }>(options: {
    currentId: string;
    next: T[];
    previous: T[];
  }) {
    const currentId = options.currentId.trim();
    if (!currentId || options.next.some((item) => item.value === currentId)) {
      return options.next;
    }
    const selected = options.previous.find((item) => item.value === currentId);
    return selected ? [selected, ...options.next] : options.next;
  }

  function applyResponsibilityOptions(
    response: {
      departments: InspectionRequestResponsibilityDepartmentOption[];
      responsibilityType: InspectionIssueResponsibilityType;
      suppliers: InspectionRequestResponsibilitySupplierOption[];
    },
    preserveSelection = false,
  ) {
    const isExternal = isExternalResponsibility(response.responsibilityType);
    responsibilityDepartmentOptions.value = preserveSelection
      ? preserveSelectedOption({
          currentId: requestForm.responsibleDepartmentId,
          next: response.departments,
          previous: responsibilityDepartmentOptions.value,
        })
      : response.departments;
    supplierOptions.value = preserveSelection
      ? preserveSelectedOption({
          currentId: requestForm.supplierId,
          next: response.suppliers,
          previous: supplierOptions.value,
        })
      : response.suppliers;

    if (
      !preserveSelection &&
      requestForm.responsibleDepartmentId &&
      !response.departments.some(
        (department) =>
          department.value === requestForm.responsibleDepartmentId,
      )
    ) {
      requestForm.responsibleDepartmentId = '';
    }

    if (isExternal) {
      requestForm.responsibleDepartmentId = '';
    } else if (!preserveSelection) {
      requestForm.responsibleDepartmentId =
        resolveInspectionRequestResponsibilityDepartmentDefault({
          currentResponsibleDepartmentId: requestForm.responsibleDepartmentId,
          departments: response.departments,
          responsibilityType: response.responsibilityType,
        });
    }

    if (isExternal) {
      return;
    }

    requestForm.supplierId = '';
  }

  async function loadResponsibilityOptions(keyword = '') {
    const normalizedKeyword = keyword.trim();
    const preserveSelection = Boolean(normalizedKeyword);
    responsibilityLoading.value = true;
    try {
      const result = await getPublicInspectionRequestResponsibilityOptions({
        keyword: normalizedKeyword || undefined,
        responsibilityType: requestForm.responsibilityType,
      });
      if (result.responsibilityType !== requestForm.responsibilityType) return;
      applyResponsibilityOptions(result, preserveSelection);
    } catch (error: unknown) {
      handleApiError(error, 'Load Inspection Request Responsibility Options');
      if (!preserveSelection) {
        responsibilityDepartmentOptions.value = [];
        supplierOptions.value = [];
      }
    } finally {
      responsibilityLoading.value = false;
    }
  }

  async function changeResponsibilityType(
    responsibilityType: InspectionIssueResponsibilityType,
  ) {
    if (requestForm.responsibilityType === responsibilityType) return;
    requestForm.responsibilityType = responsibilityType;
    clearResponsibilityIdentity();
    await loadResponsibilityOptions();
  }

  return {
    changeResponsibilityType,
    clearResponsibilityIdentity,
    loadResponsibilityOptions,
    responsibilityDepartmentOptions,
    responsibilityLoading,
    supplierOptions,
  };
}
