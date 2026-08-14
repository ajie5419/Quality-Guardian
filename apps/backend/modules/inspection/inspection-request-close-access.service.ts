import type { UserSession } from '~/utils/jwt-utils';

import { isSystemAdmin } from '@qgs/shared';
import { RbacService } from '~/modules/rbac';
import { BusinessError } from '~/utils/business-error';

const CLOSE_PERMISSION_CODE = 'QMS:Inspection:Requests:Close';

/**
 * A close permission authorizes the workflow action, while the assigned
 * inspector check prevents a privileged user from closing another QC task.
 * Administrators remain an explicit, auditable operational exception.
 */
export async function ensureCloseRequestAccess(options: {
  request: { inspectorId?: null | string };
  userinfo: UserSession;
}) {
  const userId = String(options.userinfo.userId ?? options.userinfo.id ?? '');
  if (!userId) {
    throw new BusinessError('FORBIDDEN', '无法识别当前检验员', 403);
  }
  const codes = await RbacService.getUserPermissionCodes(userId);
  if (!codes.includes(CLOSE_PERMISSION_CODE)) {
    throw new BusinessError('FORBIDDEN', '无关闭报检任务权限', 403);
  }
  if (isSystemAdmin(options.userinfo)) return;
  if (!options.request.inspectorId || options.request.inspectorId !== userId) {
    throw new BusinessError('FORBIDDEN', '该报检任务未派发给当前检验员', 403);
  }
}
