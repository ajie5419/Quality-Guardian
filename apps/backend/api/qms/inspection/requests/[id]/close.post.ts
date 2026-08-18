import { INSPECTION_REQUEST_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import upstreamHandler from '~/modules/inspection/inspection-request-close.post.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, INSPECTION_REQUEST_PERMISSION_CODES.CLOSE);
  return upstreamHandler(event);
});
