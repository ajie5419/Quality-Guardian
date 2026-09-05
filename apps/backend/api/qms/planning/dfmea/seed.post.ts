import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { dfmea_seed_get } from '~/modules/planning/routes/dfmea/seed.get.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.PLANNING.DFMEA.CREATE);
  return dfmea_seed_get(event);
});
