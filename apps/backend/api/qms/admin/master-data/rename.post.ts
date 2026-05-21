import { defineEventHandler, readBody } from 'h3';
import { MasterDataRenameService } from '~/services/master-data-rename.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { requireSystemAdmin } from '~/utils/system-auth';

interface RenameRequestBody {
  configKey?: string;
  dryRun?: boolean;
  newValue?: string;
  oldValue?: string;
}

function normalizeStringValue(value: unknown) {
  return String(value || '').trim();
}

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  try {
    const body = (await readBody(event)) as RenameRequestBody;
    const configKey = normalizeStringValue(body?.configKey);
    const oldValue = normalizeStringValue(body?.oldValue);
    const newValue = normalizeStringValue(body?.newValue);
    const dryRun = Boolean(body?.dryRun);

    if (!configKey) {
      return badRequestResponse(event, '缺少参数: configKey');
    }
    if (!MasterDataRenameService.isConfigKey(configKey)) {
      return badRequestResponse(event, '不支持的 configKey');
    }
    if (!oldValue) {
      return badRequestResponse(event, '缺少参数: oldValue');
    }
    if (!newValue) {
      return badRequestResponse(event, '缺少参数: newValue');
    }

    const results = await MasterDataRenameService.rename({
      configKey,
      oldValue,
      newValue,
      dryRun,
    });

    return useResponseSuccess({ results });
  } catch (error: unknown) {
    logApiError('qms-admin-master-data-rename', error, undefined, event);
    const message = error instanceof Error ? error.message : '主数据改名失败';
    if (message.startsWith('VALIDATION:')) {
      return badRequestResponse(event, message.replace('VALIDATION:', ''));
    }
    if (message === 'INVALID_CONFIG_KEY') {
      return badRequestResponse(event, '不支持的 configKey');
    }
    if (
      message.includes('Duplicate entry') ||
      message.includes('unique constraint') ||
      message.includes('UNIQUE constraint')
    ) {
      return conflictResponse(event, '新值已存在，无法完成改名');
    }
    return internalServerErrorResponse(event, '主数据改名失败');
  }
});
