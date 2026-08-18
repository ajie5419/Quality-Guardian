import { computed } from 'vue';

import { useAccess } from '@vben/access';

import {
  DISPATCH_ONLY_REQUEST_VIEWS,
  inspectionRequestViewOptions,
} from './inspection-request-options';

/**
 * View scopes for the request list page: the pending/dispatched management
 * scopes are only visible to users with the dispatch permission.
 */
export function useInspectionRequestViewAccess() {
  const { hasAccessByCodes, hasAccessByRoles } = useAccess();

  const canViewDispatchScopes = computed(
    () =>
      hasAccessByCodes(['QMS:Inspection:Requests:Dispatch']) ||
      hasAccessByRoles(['super', 'admin']),
  );

  const visibleViewOptions = computed(() =>
    canViewDispatchScopes.value
      ? inspectionRequestViewOptions
      : inspectionRequestViewOptions.filter(
          (option) =>
            !(DISPATCH_ONLY_REQUEST_VIEWS as readonly string[]).includes(
              option.value,
            ),
        ),
  );

  const initialView = computed(() =>
    canViewDispatchScopes.value ? 'pending' : 'my-inspection',
  );

  return { canViewDispatchScopes, initialView, visibleViewOptions };
}
