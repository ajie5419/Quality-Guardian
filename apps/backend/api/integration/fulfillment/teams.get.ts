import { defineEventHandler } from 'h3';
import { handleFulfillmentSyncRequest } from '~/modules/fulfillment-sync';

export default defineEventHandler((event) =>
  handleFulfillmentSyncRequest(event, 'teams'),
);
