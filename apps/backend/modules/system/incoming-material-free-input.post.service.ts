import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { RbacService } from '~/modules/rbac';
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

const bodySchema = z.object({ enabled: z.boolean() }).strict();
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
    const parsedBody = bodySchema.safeParse(await readBody(event));
    if (!parsedBody.success) {
      throw new BusinessError(
        'INVALID_SETTING_VALUE',
        'enabled must be a boolean',
        400,
      );
    }
    const body = parsedBody.data;
    await SystemService.saveSettingValue({
      key: 'INCOMING_MATERIAL_FREE_INPUT_ENABLED',
      value: String(body.enabled),
      description:
        'Whether public incoming inspection requests use free-text material input',
    });
    return useResponseSuccess({ message: 'Setting saved' });
  } catch (error) {
    logApiError(
      'save-incoming-material-free-input-setting',
      error,
      undefined,
      event,
    );
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    return internalServerErrorResponse(
      event,
      'Failed to save incoming material input setting',
    );
  }
});
