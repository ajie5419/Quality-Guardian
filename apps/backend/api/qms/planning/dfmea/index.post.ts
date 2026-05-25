import { defineEventHandler } from 'h3';
import { dfmea_index_post } from '~/modules/planning/routes/dfmea/index.post.service';

export default defineEventHandler(async (event) => dfmea_index_post(event));
