import { defineEventHandler } from 'h3';
import { handleFulfillmentCustomersRequest } from '~/modules/fulfillment-sync';

export default defineEventHandler((event) =>
  handleFulfillmentCustomersRequest(event),
);
