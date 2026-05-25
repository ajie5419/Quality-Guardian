import { defineEventHandler } from 'h3';
import { itp_index_post } from '~/modules/planning/routes/itp/index.post.service';

export default defineEventHandler(async (event) => itp_index_post(event));
