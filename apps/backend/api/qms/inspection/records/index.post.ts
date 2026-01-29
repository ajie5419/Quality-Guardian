import { defineEventHandler, readBody } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { useResponseSuccess, useResponseError } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const result = await InspectionService.create(body);
    return useResponseSuccess(result);
  } catch (e: any) {
    return useResponseError(e.message);
  }
});
