import { defineEventHandler } from 'h3';
import { itp_import_post } from '~/modules/planning/routes/itp/import.post.service';

export default defineEventHandler(async (event) => itp_import_post(event));
