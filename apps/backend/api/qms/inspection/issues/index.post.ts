import { defineEventHandler, readBody } from 'h3';
import { InspectionApiService } from '~/modules/inspection/inspection-api.service';
import { parseInspectionIssueCreateBody } from '~/modules/inspection/inspection-issue.schema';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const body = parseInspectionIssueCreateBody(await readBody(event));
    return useResponseSuccess(
      await InspectionApiService.createIssue(userinfo, body),
    );
  } catch (error) {
    logApiError('issues', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, 'NC number already exists');
    }
    return internalServerErrorResponse(event, 'Failed to create issue');
  }
});
