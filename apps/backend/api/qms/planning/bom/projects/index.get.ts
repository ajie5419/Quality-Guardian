import { defineEventHandler } from 'h3';
import { bom_projects_index_get } from '~/modules/planning/routes/bom/projects/index.get.service';

export default defineEventHandler(async (event) =>
  bom_projects_index_get(event),
);
