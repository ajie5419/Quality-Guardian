import type { SelectProps } from 'ant-design-vue';

import type { Ref } from 'vue';

import { ref, watch } from 'vue';

import { SUPPLIER_CATEGORY } from '@qgs/shared';

import {
  getPublicInspectionRequestSuppliers,
  getPublicInspectionRequestTeams,
} from '#/api/qms/inspection-request';

import {
  MACHINED_INCOMING_INSPECTION_TYPE,
  mapInspectionRequestEntryTeamOptions,
} from './entry-mode';

interface InspectionRequestIdentityForm {
  incomingType: string;
  supplierId: string;
  team: string;
  teamId: string;
}

export function useInspectionRequestIdentityOptions(options: {
  isIncomingEntry: Readonly<Ref<boolean>>;
  requestForm: InspectionRequestIdentityForm;
}) {
  const { isIncomingEntry, requestForm } = options;
  const teamLoading = ref(false);
  const teamOptions = ref<SelectProps['options']>([]);

  function clearResponsibleUnitIdentity(clearName = false) {
    requestForm.supplierId = '';
    requestForm.teamId = '';
    if (clearName) requestForm.team = '';
  }

  async function loadTeamOptions(keyword = '') {
    teamLoading.value = true;
    try {
      const list = await getPublicInspectionRequestTeams({
        keyword: keyword.trim() || undefined,
      });
      teamOptions.value = mapInspectionRequestEntryTeamOptions(list);
    } catch {
      teamOptions.value = [];
    } finally {
      teamLoading.value = false;
    }
  }

  async function loadSupplierOptions(keyword = '') {
    teamLoading.value = true;
    try {
      teamOptions.value = await getPublicInspectionRequestSuppliers({
        category:
          requestForm.incomingType === MACHINED_INCOMING_INSPECTION_TYPE
            ? SUPPLIER_CATEGORY.OUTSOURCING
            : SUPPLIER_CATEGORY.SUPPLIER,
        keyword: keyword.trim() || undefined,
      });
    } catch {
      teamOptions.value = [];
    } finally {
      teamLoading.value = false;
    }
  }

  async function loadResponsibleUnitOptions(keyword = '') {
    if (isIncomingEntry.value) {
      await loadSupplierOptions(keyword);
      return;
    }
    await loadTeamOptions(keyword);
  }

  watch(
    () => requestForm.incomingType,
    (nextValue, previousValue) => {
      if (!isIncomingEntry.value) return;
      if (nextValue !== previousValue && previousValue !== undefined) {
        clearResponsibleUnitIdentity(true);
      }
      void loadSupplierOptions(requestForm.team);
    },
  );

  return {
    teamLoading,
    teamOptions,
    clearResponsibleUnitIdentity,
    loadResponsibleUnitOptions,
  };
}
