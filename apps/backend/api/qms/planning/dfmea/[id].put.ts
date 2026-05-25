import { defineEventHandler } from 'h3';
import { dfmea_id_put } from '~/modules/planning/routes/dfmea/[id].put.service';

export default defineEventHandler(async (event) => dfmea_id_put(event));
