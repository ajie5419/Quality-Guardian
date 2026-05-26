import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z.object({
  limit: z.number().int().positive().max(1000).optional(),
  markMissing: z.boolean().optional(),
});

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const body = bodySchema.parse(await readBody(event));
    const result = await FileStorageService.scanMissingFiles({
      limit: body.limit ?? 100,
      markMissing: body.markMissing ?? false,
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
    logApiError('file-scan-missing', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to scan missing files');
  }
});
