import { defineEventHandler } from 'h3';
import { bom_index_post } from '~/modules/planning/routes/bom/index.post.service';

export default defineEventHandler(async (event) => bom_index_post(event));
