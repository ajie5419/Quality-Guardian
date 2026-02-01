import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { InspectionService } from '~/services/inspection.service';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { items, category } = body;

  let successCount = 0;
  if (items && Array.isArray(items)) {
    for (const item of items) {
      try {
        await InspectionService.create({
          ...item,
          category: category || item.category || 'PROCESS',
        });
        successCount++;
      } catch (error) {
        logApiError('import', error);
      }
    }
  }

  return useResponseSuccess({ successCount });
});
