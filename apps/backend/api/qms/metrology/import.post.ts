import { METROLOGY_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import upstreamHandler from '~/modules/metrology/metrology-import.post.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, METROLOGY_PERMISSION_CODES.IMPORT);
  return upstreamHandler(event);
});
