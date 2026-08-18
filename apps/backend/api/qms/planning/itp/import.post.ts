import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { itp_import_post } from '~/modules/planning/routes/itp/import.post.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.PLANNING.ITP.CREATE);
  return itp_import_post(event);
});
