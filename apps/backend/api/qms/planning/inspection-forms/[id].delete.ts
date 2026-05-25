import { defineEventHandler } from 'h3';
import { inspection_forms_id_delete } from '~/modules/planning/routes/inspection-forms/[id].delete.service';

export default defineEventHandler(async (event) =>
  inspection_forms_id_delete(event),
);
