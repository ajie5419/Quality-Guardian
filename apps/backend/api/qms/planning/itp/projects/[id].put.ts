import { defineEventHandler } from 'h3';
import { itp_projects_id_put } from '~/modules/planning/routes/itp/projects/[id].put.service';

export default defineEventHandler(async (event) => itp_projects_id_put(event));
