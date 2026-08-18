import { METROLOGY_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import upstreamHandler from '~/modules/metrology/calibration-plan-create.post.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(
    event,
    METROLOGY_PERMISSION_CODES.CALIBRATION_PLAN_CREATE,
  );
  return upstreamHandler(event);
});
