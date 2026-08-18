import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import inspectionIssueDeleteHandler from '~/modules/inspection/inspection-issue-id.delete.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, INSPECTION_ISSUE_PERMISSION_CODES.DELETE);
  return inspectionIssueDeleteHandler(event);
});
