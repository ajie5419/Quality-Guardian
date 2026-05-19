import { defineEventHandler, readBody } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
    const result = await FileStorageService.scanMissingFiles({
      limit: Number(body.limit || 100),
      markMissing: Boolean(body.markMissing),
    });
    await recordBusinessAuditLog(event, {
      action: 'UPDATE',
      detailsTemplate:
        '扫描缺失文件: checked={{checked}}, missing={{missing}}, marked={{marked}}',
      detailsVariables: {
        checked: result.checked,
        marked: result.marked,
        missing: result.missingIds.length,
      },
      targetId: 'file-assets',
      targetType: 'file_center',
      userId: userinfo.id,
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('file-scan-missing', error);
    return internalServerErrorResponse(event, 'Failed to scan missing files');
  }
});
