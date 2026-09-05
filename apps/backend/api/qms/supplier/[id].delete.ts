import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import upstreamHandler from '~/modules/supplier/supplier-id.delete.service';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.SUPPLIER.DELETE);
  return upstreamHandler(event);
});
