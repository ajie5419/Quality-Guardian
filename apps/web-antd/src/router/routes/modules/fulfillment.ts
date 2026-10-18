import { buildFulfillmentRoutes } from '#/router/fulfillment-link';

// External entry to the fulfillment system; hidden unless VITE_FULFILLMENT_URL is set.
export default buildFulfillmentRoutes(import.meta.env.VITE_FULFILLMENT_URL);
