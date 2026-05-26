import { defineEventHandler } from 'h3';
import { KnowledgeRouteService } from '~/modules/knowledge/knowledge-route.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const tree = await KnowledgeRouteService.getCategoryTree();
    return useResponseSuccess(tree);
  } catch (error) {
    logApiError('categories', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to fetch knowledge categories',
    );
  }
});
