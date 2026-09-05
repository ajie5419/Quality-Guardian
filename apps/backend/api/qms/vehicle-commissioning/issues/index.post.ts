import { VEHICLE_COMMISSIONING_WRITE_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import vehicleCommissioningIssueCreateHandler from '~/modules/vehicle-commissioning/vehicle-commissioning-issue-create.post.service';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, VEHICLE_COMMISSIONING_WRITE_CODES.CREATE);
  return vehicleCommissioningIssueCreateHandler(event);
});
