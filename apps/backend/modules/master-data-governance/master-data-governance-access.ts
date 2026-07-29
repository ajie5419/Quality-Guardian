import type { H3Event } from 'h3';

import { isSystemAdmin } from '@qgs/shared';
import { RbacService } from '~/modules/rbac';
import { BusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';

export const MASTER_DATA_GOVERNANCE_LIST_PERMISSION =
  'System:MasterDataGovernance:List';
export const MASTER_DATA_GOVERNANCE_EDIT_PERMISSION =
  'System:MasterDataGovernance:Edit';

export async function assertMasterDataGovernancePermission(
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
