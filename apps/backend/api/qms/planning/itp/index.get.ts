import { defineEventHandler } from 'h3';
import { itp_index_get } from '~/modules/planning/routes/itp/index.get.service';

export default defineEventHandler(async (event) => itp_index_get(event));
