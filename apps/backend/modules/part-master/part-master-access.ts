import type { H3Event } from 'h3';

import { isSystemAdmin } from '@qgs/shared';
import { RbacService } from '~/modules/rbac';
import { BusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';

export const PART_MASTER_LIST_PERMISSION = 'System:PartMaster:List';
export const PART_MASTER_EDIT_PERMISSION = 'System:PartMaster:Edit';

export async function assertPartMasterPermission(
  event: H3Event,
  permission: string,
) {
  const user = getCurrentUser(event);
  if (isSystemAdmin(user)) return;
  const userId = String(user?.userId || user?.id || '');
  const codes = await RbacService.getUserPermissionCodes(userId);
  if (!codes.includes(permission)) {
    throw new BusinessError('PERMISSION_DENIED', 'Permission denied', 403);
  }
}
