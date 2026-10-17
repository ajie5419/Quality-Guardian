import { defineEventHandler } from 'h3';
import { handleFulfillmentBomRequest } from '~/modules/fulfillment-sync';

export default defineEventHandler((event) =>
  handleFulfillmentBomRequest(event),
);
