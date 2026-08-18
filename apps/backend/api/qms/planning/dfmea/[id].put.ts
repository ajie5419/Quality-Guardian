import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { dfmea_id_put } from '~/modules/planning/routes/dfmea/[id].put.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.PLANNING.DFMEA.EDIT);
  return dfmea_id_put(event);
});
