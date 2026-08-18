import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { itp_id_delete } from '~/modules/planning/routes/itp/[id].delete.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.PLANNING.ITP.DELETE);
  return itp_id_delete(event);
});
