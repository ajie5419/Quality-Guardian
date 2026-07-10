import type { UserSession } from '~/utils/jwt-utils';

import { RbacService } from '~/modules/rbac/rbac.service';
import { BusinessError } from '~/utils/business-error';

export const InspectionIssueAccessService = {
  async ensurePermission(userinfo: UserSession, permissionCode: string) {
    const userId = userinfo.userId || userinfo.id;
    const codes = userId
      ? await RbacService.getUserPermissionCodes(String(userId))
      : [];
    if (!codes.includes(permissionCode)) {
      throw new BusinessError('FORBIDDEN', '无不合格品项操作权限', 403);
    }
  },
};
