import { defineEventHandler } from 'h3';
import { bom_import_post } from '~/modules/planning/routes/bom/import.post.service';

export default defineEventHandler(async (event) => bom_import_post(event));
