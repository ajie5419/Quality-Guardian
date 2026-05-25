import { defineEventHandler } from 'h3';
import { inspection_forms_id_put } from '~/modules/planning/routes/inspection-forms/[id].put.service';

export default defineEventHandler(async (event) =>
  inspection_forms_id_put(event),
);
