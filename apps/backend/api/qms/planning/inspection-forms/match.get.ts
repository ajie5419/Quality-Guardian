import { defineEventHandler } from 'h3';
import { inspection_forms_match_get } from '~/modules/planning/routes/inspection-forms/match.get.service';

export default defineEventHandler(async (event) =>
  inspection_forms_match_get(event),
);
