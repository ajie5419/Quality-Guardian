import type Redis from 'ioredis';
import type { ServerResponse } from 'node:http';

import type { mapInspectionRequest } from './inspection-request';

import { randomUUID } from 'node:crypto';

import { createModuleLogger } from '~/utils/logger';
import { redis } from '~/utils/redis';

type InspectionRequestEventPayload = ReturnType<typeof mapInspectionRequest>;

type InspectionRequestEvent = {
  request: InspectionRequestEventPayload;
  type: 'inspection-request-created';
};

type RedisInspectionRequestEvent = {
  event: InspectionRequestEvent;
  sourceId: string;
};

const INSPECTION_REQUEST_EVENTS_CHANNEL = 'qms:inspection-requests:events';
const INSTANCE_ID = randomUUID();
const logger = createModuleLogger('InspectionRequestEvents');
const clients = new Set<ServerResponse>();
let redisSubscriber: null | Redis = null;
let redisSubscribePromise: null | Promise<void> = null;

function writeSseEvent(response: ServerResponse, event: string, data: unknown) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastToLocalClients(payload: InspectionRequestEvent) {
  for (const client of clients) {
    if (client.destroyed || client.writableEnded) {
      clients.delete(client);
      continue;
    }
    writeSseEvent(client, payload.type, payload);
  }
}

function parseRedisEvent(message: string) {
  try {
    const parsed = JSON.parse(message) as Partial<RedisInspectionRequestEvent>;
    if (
      !parsed ||
      parsed.sourceId === INSTANCE_ID ||
      parsed.event?.type !== 'inspection-request-created' ||
      !parsed.event.request
    ) {
      return null;
    }
    return parsed.event;
  } catch {
    return null;
  }
}

async function ensureRedisSubscription() {
  const client = redis.getClient();
  if (!client || redisSubscriber) return;
  if (redisSubscribePromise !== null) {
    await redisSubscribePromise;
    return;
  }

  const subscriber = client.duplicate();
  subscriber.on('message', (channel, message) => {
    if (channel !== INSPECTION_REQUEST_EVENTS_CHANNEL) return;
    const event = parseRedisEvent(message);
    if (event) broadcastToLocalClients(event);
  });
  subscriber.on('error', (error) => {
    logger.warn({ err: error }, 'Redis inspection request subscriber error');
  });

  redisSubscribePromise = subscriber
    .subscribe(INSPECTION_REQUEST_EVENTS_CHANNEL)
    .then(() => {
      redisSubscriber = subscriber;
      logger.info('Redis inspection request event subscription ready');
    })
    .catch((error: unknown) => {
      redisSubscribePromise = null;
      redisSubscriber = null;
      subscriber.disconnect();
      logger.warn(
        { err: error },
        'Redis inspection request event subscription unavailable',
      );
    });

  await redisSubscribePromise;
}

async function publishToRedis(event: InspectionRequestEvent) {
  const client = redis.getClient();
  if (!client) return;
  try {
    await client.publish(
      INSPECTION_REQUEST_EVENTS_CHANNEL,
      JSON.stringify({ event, sourceId: INSTANCE_ID }),
    );
  } catch (error) {
    logger.warn(
      { err: error },
      'Redis inspection request event publish failed',
    );
  }
}

export function subscribeInspectionRequestEvents(response: ServerResponse) {
  clients.add(response);
  response.write(': connected\n\n');
  void ensureRedisSubscription();

  return () => {
    clients.delete(response);
  };
}

export function sendInspectionRequestHeartbeat(response: ServerResponse) {
  response.write(': heartbeat\n\n');
}

export function publishInspectionRequestCreated(
  request: InspectionRequestEventPayload,
) {
  const payload: InspectionRequestEvent = {
    request,
    type: 'inspection-request-created',
  };

  broadcastToLocalClients(payload);
  void publishToRedis(payload);
}
