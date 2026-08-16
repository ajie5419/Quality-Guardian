import { METROLOGY_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import upstreamHandler from '~/modules/metrology/metrology-create.post.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, METROLOGY_PERMISSION_CODES.CREATE);
  return upstreamHandler(event);
});
