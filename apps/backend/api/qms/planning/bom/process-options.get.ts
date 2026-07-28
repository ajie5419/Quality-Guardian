import { defineEventHandler } from 'h3';
import { bom_process_options_get } from '~/modules/planning/routes/bom/process-options.get.service';

export default defineEventHandler(async (event) =>
  bom_process_options_get(event),
);
