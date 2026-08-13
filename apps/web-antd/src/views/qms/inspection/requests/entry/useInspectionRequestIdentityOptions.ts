import type {
  InspectionIssueResponsibilityType,
  InspectionRequestResponsibilityDepartmentOption,
  InspectionRequestResponsibilitySupplierOption,
  InspectionRequestTeamOption,
} from '@qgs/shared';

import { ref } from 'vue';

import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  resolveInspectionRequestResponsibilityDepartmentDefault,
} from '@qgs/shared';

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
    options: {
      departments: InspectionRequestResponsibilityDepartmentOption[];
      responsibilityType: InspectionIssueResponsibilityType;
      suppliers: InspectionRequestResponsibilitySupplierOption[];
    },
    preserveSelection = false,
  ) {
    const isExternal = isExternalResponsibility(options.responsibilityType);
    responsibilityDepartmentOptions.value = preserveSelection
      ? preserveSelectedOption({
          currentId: requestForm.responsibleDepartmentId,
          next: options.departments,
          previous: responsibilityDepartmentOptions.value,
        })
      : options.departments;
    supplierOptions.value = preserveSelection
      ? preserveSelectedOption({
          currentId: requestForm.supplierId,
          next: options.suppliers,
          previous: supplierOptions.value,
        })
      : options.suppliers;

    if (
      !preserveSelection &&
      requestForm.responsibleDepartmentId &&
      !options.departments.some(
        (department) =>
          department.value === requestForm.responsibleDepartmentId,
      )
    ) {
      requestForm.responsibleDepartmentId = '';
      requestForm.team = '';
      requestForm.teamId = '';
    }

    if (!preserveSelection) {
      requestForm.responsibleDepartmentId =
        resolveInspectionRequestResponsibilityDepartmentDefault({
          currentResponsibleDepartmentId: requestForm.responsibleDepartmentId,
          departments: options.departments,
          responsibilityType: options.responsibilityType,
        });
    }

    if (isExternal) {
      requestForm.team = '';
      requestForm.teamId = '';
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
      if (
        requestForm.responsibilityType ===
          INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT &&
        !preserveSelection
      ) {
        const teams = await getPublicInspectionRequestTeams({
          keyword: undefined,
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
          requestForm.teamId &&
          !internalTeamOptions.value.some(
            (team) =>
              team.value === requestForm.teamId &&
              team.responsibleDepartmentId ===
                requestForm.responsibleDepartmentId,
          )
        ) {
          requestForm.team = '';
          requestForm.teamId = '';
        }
      } else {
        if (!preserveSelection) internalTeamOptions.value = [];
      }
      applyResponsibilityOptions(result, preserveSelection);
    } catch (error: unknown) {
      handleApiError(error, 'Load Inspection Request Responsibility Options');
      if (!preserveSelection) {
        responsibilityDepartmentOptions.value = [];
        internalTeamOptions.value = [];
        supplierOptions.value = [];
      }
    } finally {
      responsibilityLoading.value = false;
    }
  }

  async function loadInternalTeamOptions(keyword = '') {
    if (
      requestForm.responsibilityType !==
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
    ) {
      return;
    }
    responsibilityLoading.value = true;
    try {
      const teams = await getPublicInspectionRequestTeams({
        keyword: keyword.trim() || undefined,
      });
      internalTeamOptions.value = teams.filter(
        (team) =>
          team.group === 'internal' && Boolean(team.responsibleDepartmentId),
      );
    } catch (error: unknown) {
      handleApiError(error, 'Load Inspection Request Internal Teams');
      internalTeamOptions.value = [];
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
    loadInternalTeamOptions,
    responsibilityDepartmentOptions,
    responsibilityLoading,
    supplierOptions,
  };
}
