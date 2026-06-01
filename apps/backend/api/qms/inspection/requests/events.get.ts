import { defineEventHandler, setHeader, setResponseStatus } from 'h3';
import {
  sendInspectionRequestHeartbeat,
  subscribeInspectionRequestEvents,
} from '~/modules/inspection/inspection-request-events';
import { RbacService } from '~/modules/rbac/rbac.service';
import { getOptionalCurrentUser } from '~/utils/current-user';

const HEARTBEAT_INTERVAL_MS = 25_000;

const ALERT_PERMISSION_CODE = 'QMS:Inspection:Requests:Dispatch';

export default defineEventHandler(async (event) => {
  const user = getOptionalCurrentUser(event);
  const userId = user?.userId || user?.id;
  if (!userId) {
    setResponseStatus(event, 401);
    return { message: 'Unauthorized' };
  }
  const codes = await RbacService.getUserPermissionCodes(String(userId));
  if (!codes.includes(ALERT_PERMISSION_CODE)) {
    setResponseStatus(event, 403);
    return { message: 'Forbidden' };
  }

  setHeader(event, 'Content-Type', 'text/event-stream; charset=utf-8');
  setHeader(event, 'Cache-Control', 'no-cache, no-transform');
  setHeader(event, 'Connection', 'keep-alive');
  setHeader(event, 'X-Accel-Buffering', 'no');

  const response = event.node.res;
  const unsubscribe = subscribeInspectionRequestEvents(response);
  const heartbeat = setInterval(() => {
    if (response.destroyed || response.writableEnded) {
      clearInterval(heartbeat);
      unsubscribe();
      return;
    }
    sendInspectionRequestHeartbeat(response);
  }, HEARTBEAT_INTERVAL_MS);

  event.node.req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
