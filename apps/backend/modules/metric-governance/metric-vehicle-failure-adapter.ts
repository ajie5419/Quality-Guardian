import type { MetricCalculationAdapter } from './metric-shadow-validation';

/** Fails closed until the failure-event identity and warranty scope are approved. */
export const vehicleFailureAdapter: MetricCalculationAdapter = {
  metricCode: 'BM-VEHICLE-FAILURE-COUNT',
  registryDefinition: 'count of vehicle failure events in the reporting scope',
  sourceQuery:
    'VehicleFailureRateService and vehicle commissioning issue queries',
  calculateCurrent: async () => {
    throw new Error('VEHICLE_FAILURE_EVENT_POLICY_PENDING');
  },
  calculateShadow: async () => {
    throw new Error('VEHICLE_FAILURE_EVENT_POLICY_PENDING');
  },
};
