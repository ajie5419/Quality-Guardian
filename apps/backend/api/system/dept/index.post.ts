import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { DeptService } from '~/services/dept.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    const newDept = await DeptService.create(body);
    return useResponseSuccess(newDept);
  } catch (error) {
    logApiError('dept', error);
    const errorCode = (error as { code?: string }).code;
    setResponseStatus(event, errorCode === 'P2002' ? 409 : 500);
    return useResponseError(
      errorCode === 'P2002' ? '部门名称已存在' : '创建部门失败',
    );
  }
});
