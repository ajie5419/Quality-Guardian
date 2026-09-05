import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import inspectionIssueCreateHandler from '~/modules/inspection/inspection-issue-create.post.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, INSPECTION_ISSUE_PERMISSION_CODES.CREATE);
  return inspectionIssueCreateHandler(event);
});
