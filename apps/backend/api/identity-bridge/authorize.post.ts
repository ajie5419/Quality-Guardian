import { defineEventHandler } from 'h3';
import {
  assertIdentityBridgePermission,
  handleIdentityBridge,
} from '~/modules/identity-bridge';

export default defineEventHandler((event) =>
  handleIdentityBridge(
    event,
    'authorize',
    assertIdentityBridgePermission(event, 'authorize'),
  ),
);
