import type { InspectionRequest } from '@qgs/shared';
import type { ServerResponse } from 'node:http';

type InspectionRequestEvent = {
  request: InspectionRequest;
  type: 'inspection-request-created';
};

const clients = new Set<ServerResponse>();

function writeSseEvent(response: ServerResponse, event: string, data: unknown) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function subscribeInspectionRequestEvents(response: ServerResponse) {
  clients.add(response);
  response.write(': connected\n\n');

  return () => {
    clients.delete(response);
  };
}

export function sendInspectionRequestHeartbeat(response: ServerResponse) {
  response.write(': heartbeat\n\n');
}

export function publishInspectionRequestCreated(request: InspectionRequest) {
  const payload: InspectionRequestEvent = {
    request,
    type: 'inspection-request-created',
  };

  for (const client of clients) {
    if (client.destroyed || client.writableEnded) {
      clients.delete(client);
      continue;
    }
    writeSseEvent(client, payload.type, payload);
  }
}
