import { defineEventHandler } from 'h3';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  try {
    return useResponseSuccess(
      await MasterDataGovernanceKernel.auditGovernance(),
    );
  } catch (error: unknown) {
    logApiError('qms-admin-master-data-audit', error, undefined, event);
    return internalServerErrorResponse(event, '主数据孤立值扫描失败');
  }
});
