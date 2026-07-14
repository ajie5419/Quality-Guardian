import type { UserSession } from '~/utils/jwt-utils';

import { isSystemAdmin } from '@qgs/shared';
import { BusinessError } from '~/utils/business-error';

export const SupplierIdentityAccessService = {
  ensureAdmin(userinfo: null | UserSession) {
    if (!isSystemAdmin(userinfo)) {
      throw new BusinessError(
        'FORBIDDEN',
        'Only system administrators can manage supplier identity links',
        403,
      );
    }
  },
};
