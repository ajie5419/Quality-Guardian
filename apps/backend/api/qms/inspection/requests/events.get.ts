import { defineEventHandler, setHeader } from 'h3';
import {
  sendInspectionRequestHeartbeat,
  subscribeInspectionRequestEvents,
} from '~/utils/inspection-request-events';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse } from '~/utils/response';

const HEARTBEAT_INTERVAL_MS = 25_000;

export default defineEventHandler((event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
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
