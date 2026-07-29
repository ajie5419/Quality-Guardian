/**
 * Historical names are immutable read-compatibility evidence for records that
 * predate canonical classification IDs. Online writes must still use the code
 * and resolved ID instead of these display snapshots.
 */
export const VEHICLE_PRODUCT_CLASSIFICATION_IDENTITY = {
  code: 'VEHICLE_PRODUCT',
  historicalNames: ['车辆产品'],
} as const;
