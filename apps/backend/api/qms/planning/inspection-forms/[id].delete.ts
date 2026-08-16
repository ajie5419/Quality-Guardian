import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { inspection_forms_id_delete } from '~/modules/planning/routes/inspection-forms/[id].delete.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(
    event,
    PERMISSION_CODES.QMS.PLANNING.INSPECTION_FORM.DELETE,
  );
  return inspection_forms_id_delete(event);
});
