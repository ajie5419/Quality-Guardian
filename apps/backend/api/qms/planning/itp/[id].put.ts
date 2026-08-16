import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { itp_id_put } from '~/modules/planning/routes/itp/[id].put.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.PLANNING.ITP.EDIT);
  return itp_id_put(event);
});
