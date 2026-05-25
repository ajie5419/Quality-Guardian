import { defineEventHandler, getQuery } from 'h3';
import { z } from 'zod';
import { VehicleFailureRateService } from '~/modules/report/vehicle-failure-rate.service';
import { logApiError } from '~/utils/api-logger';
import { useResponseSuccess } from '~/utils/response';

const VehicleFailureRateQuerySchema = z.object({
  month: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  const query = VehicleFailureRateQuerySchema.parse(getQuery(event));

  try {
    return useResponseSuccess(
      await VehicleFailureRateService.getVehicleFailureRate(query.month),
    );
  } catch (error) {
    logApiError('vehicle-failure-rate', error, undefined, event);
    return useResponseSuccess({
      ranking: [],
      trend: [],
      yearIntensity: [],
      yearSeries: [],
      yearWarrantySeries: [],
    });
  }
});
