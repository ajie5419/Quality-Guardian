import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import inspectionIssueUpdateHandler from '~/modules/inspection/inspection-issue-id.put.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, INSPECTION_ISSUE_PERMISSION_CODES.EDIT);
  return inspectionIssueUpdateHandler(event);
});
