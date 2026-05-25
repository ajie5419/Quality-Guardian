import { defineEventHandler } from 'h3';
import { inspection_forms_index_get } from '~/modules/planning/routes/inspection-forms/index.get.service';

export default defineEventHandler(async (event) =>
  inspection_forms_index_get(event),
);
