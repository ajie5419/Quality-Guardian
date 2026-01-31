import { defineEventHandler } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const ncNumber = await InspectionService.generateNextNcNumber();
    return useResponseSuccess({ ncNumber });
  } catch (error) {
    console.error('Failed to generate NC number:', error);
    throw error;
  }
});
