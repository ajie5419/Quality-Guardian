import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
} from '~/utils/response';
import { requireSystemAdmin } from '~/utils/system-auth';

interface RenameRequestBody {
  configKey?: string;
  newValue?: string;
  oldValue?: string;
}

function normalizeStringValue(value: unknown) {
  return String(value || '').trim();
}

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  try {
    const body = (await readBody(event)) as RenameRequestBody;
    const oldValue = normalizeStringValue(body?.oldValue);
    const newValue = normalizeStringValue(body?.newValue);
    if (!oldValue) {
      return badRequestResponse(event, '缺少参数: oldValue');
    }
    if (!newValue) {
      return badRequestResponse(event, '缺少参数: newValue');
    }

    return badRequestResponse(
      event,
      '主数据改名功能已下线',
      'MasterDataRenameDisabled',
    );
  } catch (error: unknown) {
    logApiError('qms-admin-master-data-rename', error, undefined, event);
    const message = error instanceof Error ? error.message : '主数据改名失败';
    if (message.startsWith('VALIDATION:')) {
      return badRequestResponse(event, message.replace('VALIDATION:', ''));
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
