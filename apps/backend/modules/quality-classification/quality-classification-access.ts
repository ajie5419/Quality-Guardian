import type { H3Event } from 'h3';

import { isSystemAdmin } from '@qgs/shared';
import { RbacService } from '~/modules/rbac';
import { BusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';

export const QUALITY_CLASSIFICATION_LIST_PERMISSION =
  'System:QualityClassification:List';
export const QUALITY_CLASSIFICATION_EDIT_PERMISSION =
  'System:QualityClassification:Edit';

export async function assertQualityClassificationPermission(
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
