import { defineEventHandler } from 'h3';
import { QualityLossService } from '~/services/quality-loss.service';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const result = await QualityLossService.getAllLosses();
    return useResponseSuccess(result);
  } catch (error) {
    console.error('Failed to fetch quality losses:', error);
    return useResponseSuccess([]);
  }
});
