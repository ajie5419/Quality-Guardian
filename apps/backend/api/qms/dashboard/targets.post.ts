import { DASHBOARD_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import upstreamHandler from '~/modules/dashboard/dashboard-targets.post.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, DASHBOARD_PERMISSION_CODES.CHART_EDIT);
  return upstreamHandler(event);
});
