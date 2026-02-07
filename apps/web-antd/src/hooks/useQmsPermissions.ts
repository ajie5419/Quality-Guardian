import { computed } from 'vue';

import { useAccess } from '@vben/access';

/**
 * Hook to centralize QMS permission checks
 * @param prefix The permission prefix (e.g., 'QMS:WorkOrder' or 'QMS:Supplier')
 */
export function useQmsPermissions(prefix: string) {
  const { hasAccessByCodes } = useAccess();

  const canList = computed(() => hasAccessByCodes([`${prefix}:List`]));
  const canCreate = computed(() => hasAccessByCodes([`${prefix}:Create`]));
  const canEdit = computed(() => hasAccessByCodes([`${prefix}:Edit`]));
  const canDelete = computed(() => hasAccessByCodes([`${prefix}:Delete`]));
  const canExport = computed(() => hasAccessByCodes([`${prefix}:Export`]));
  const canImport = computed(() => hasAccessByCodes([`${prefix}:Import`]));

  return {
    canList,
    canCreate,
    canEdit,
    canDelete,
    canExport,
    canImport,
    hasAccessByCodes,
  };
}
