import { defineEventHandler } from 'h3';
import { dfmea_id_delete } from '~/modules/planning/routes/dfmea/[id].delete.service';

export default defineEventHandler(async (event) => dfmea_id_delete(event));
