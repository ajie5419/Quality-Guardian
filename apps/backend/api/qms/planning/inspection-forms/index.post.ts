import { defineEventHandler } from 'h3';
import { inspection_forms_index_post } from '~/modules/planning/routes/inspection-forms/index.post.service';

export default defineEventHandler(async (event) =>
  inspection_forms_index_post(event),
);
