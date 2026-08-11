import type {
  InspectionIssueResponsibilityType,
  InspectionRequestResponsibilityDepartmentOption,
  InspectionRequestResponsibilitySupplierOption,
  InspectionRequestTeamOption,
} from '@qgs/shared';

import { ref } from 'vue';

import { INSPECTION_ISSUE_RESPONSIBILITY_TYPE } from '@qgs/shared';

import {
  getPublicInspectionRequestResponsibilityOptions,
  getPublicInspectionRequestTeams,
} from '#/api/qms/inspection-request';
import { useErrorHandler } from '#/hooks/useErrorHandler';

interface InspectionRequestIdentityForm {
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  supplierId: string;
  team: string;
  teamId: string;
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
  const internalTeamOptions = ref<InspectionRequestTeamOption[]>([]);

  function clearResponsibilityIdentity() {
    requestForm.responsibleDepartmentId = '';
    requestForm.supplierId = '';
    requestForm.team = '';
    requestForm.teamId = '';
  }

  function applyResponsibilityOptions(options: {
    departments: InspectionRequestResponsibilityDepartmentOption[];
    responsibilityType: InspectionIssueResponsibilityType;
    suppliers: InspectionRequestResponsibilitySupplierOption[];
  }) {
    responsibilityDepartmentOptions.value = options.departments;
    supplierOptions.value = options.suppliers;

    if (isExternalResponsibility(options.responsibilityType)) {
      const [department] = options.departments;
      requestForm.responsibleDepartmentId = department?.value || '';
      requestForm.team = '';
      requestForm.teamId = '';
      return;
    }

    if (!requestForm.teamId) {
      requestForm.responsibleDepartmentId = '';
    }
    requestForm.supplierId = '';
  }

  async function loadResponsibilityOptions(keyword = '') {
    responsibilityLoading.value = true;
    try {
      const result = await getPublicInspectionRequestResponsibilityOptions({
        keyword: keyword.trim() || undefined,
        responsibilityType: requestForm.responsibilityType,
      });
      if (result.responsibilityType !== requestForm.responsibilityType) return;
      if (
        requestForm.responsibilityType ===
        INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
      ) {
        const teams = await getPublicInspectionRequestTeams({
          keyword: keyword.trim() || undefined,
        });
        if (
          requestForm.responsibilityType !==
          INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
        ) {
          return;
        }
        internalTeamOptions.value = teams.filter(
          (team) =>
            team.group === 'internal' && Boolean(team.responsibleDepartmentId),
        );
        if (
          !internalTeamOptions.value.some(
            (team) => team.value === requestForm.teamId,
          )
        ) {
          requestForm.teamId = '';
          requestForm.responsibleDepartmentId = '';
        }
      } else {
        internalTeamOptions.value = [];
      }
      applyResponsibilityOptions(result);
    } catch (error: unknown) {
      handleApiError(error, 'Load Inspection Request Responsibility Options');
      responsibilityDepartmentOptions.value = [];
      internalTeamOptions.value = [];
      supplierOptions.value = [];
      clearResponsibilityIdentity();
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
    internalTeamOptions,
    responsibilityDepartmentOptions,
    responsibilityLoading,
    supplierOptions,
  };
}
