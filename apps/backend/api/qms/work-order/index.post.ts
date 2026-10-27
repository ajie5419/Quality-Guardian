import { defineEventHandler } from 'h3';
import {
  assertQmsWorkOrderWritePermission,
  rejectQmsWorkOrderWrite,
} from '~/modules/work-order';

// Work orders are maintained by the fulfillment system
// (/api/integration/fulfillment/work-orders); QMS keeps view and export only.
export default defineEventHandler((event) =>
  rejectQmsWorkOrderWrite(event, assertQmsWorkOrderWritePermission),
);
