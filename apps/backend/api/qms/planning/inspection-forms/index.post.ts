import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { inspection_forms_index_post } from '~/modules/planning/routes/inspection-forms/index.post.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(
    event,
    PERMISSION_CODES.QMS.PLANNING.INSPECTION_FORM.CREATE,
  );
  return inspection_forms_index_post(event);
});
