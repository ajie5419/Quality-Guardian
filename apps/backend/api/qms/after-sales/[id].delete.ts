import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import upstreamHandler from '~/modules/after-sales/after-sales-id.delete.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.AFTER_SALES.DELETE);
  return upstreamHandler(event);
});
