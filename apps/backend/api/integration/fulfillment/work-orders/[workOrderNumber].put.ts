import { defineEventHandler } from 'h3';
import {
  assertFulfillmentWorkOrderPermission,
  handleFulfillmentWorkOrderWrite,
} from '~/modules/work-order';

export default defineEventHandler((event) =>
  handleFulfillmentWorkOrderWrite(
    event,
    'update',
    assertFulfillmentWorkOrderPermission,
  ),
);
