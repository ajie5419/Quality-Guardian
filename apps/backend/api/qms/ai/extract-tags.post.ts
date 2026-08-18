import { AI_GENERATION_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import upstreamHandler from '~/modules/ai/extract-tags.post.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, AI_GENERATION_PERMISSION_CODES.GENERATE);
  return upstreamHandler(event);
});
