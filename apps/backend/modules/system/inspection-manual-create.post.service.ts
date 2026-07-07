import { defineEventHandler, readBody } from 'h3';
import { RbacService } from '~/modules/rbac/rbac.service';
import { logApiError } from '~/utils/api-logger';
import {
  BusinessError,
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

import { SystemService } from './system.service';

const PERMISSION_CODE = 'System:InspectionSettings:Edit';

export default defineEventHandler(async (event) => {
  try {
    const userinfo = getCurrentUser(event);
    const codes = await RbacService.getUserPermissionCodes(
      String(userinfo.userId || userinfo.id),
    );
    if (!codes.includes(PERMISSION_CODE)) {
      throw new BusinessError(
        'PERMISSION_DENIED',
        'No permission to edit this setting',
        403,
      );
    }

    const body = await readBody<{ enabled: boolean }>(event);

    await SystemService.saveSettingValue({
      key: 'INSPECTION_MANUAL_CREATE_ENABLED',
      value: String(Boolean(body?.enabled)),
      description:
        'Whether manual creation of inspection records (incoming/process/shipping) is allowed',
    });

    return useResponseSuccess({ message: 'Setting saved' });
  } catch (error) {
    logApiError(
      'save-inspection-manual-create-setting',
      error,
      undefined,
      event,
    );
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) {
      return businessErrorResponse(event, businessError);
    }
    return internalServerErrorResponse(
      event,
      'Failed to save inspection manual create setting',
    );
  }
});
