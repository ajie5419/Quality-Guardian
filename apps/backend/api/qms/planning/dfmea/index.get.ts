import { defineEventHandler } from 'h3';
import { dfmea_index_get } from '~/modules/planning/routes/dfmea/index.get.service';

export default defineEventHandler(async (event) => dfmea_index_get(event));
