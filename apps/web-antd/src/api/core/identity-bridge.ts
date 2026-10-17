import { publicRequestClient, requestClient } from '#/api/request';

export interface IdentityAuthorization {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  method: 'S256';
}

export function authorizeIdentity(data: IdentityAuthorization) {
  return requestClient.post<{ callback: string }>(
    '/identity-bridge/authorize',
    data,
  );
}

/** Display name of the registered client; 404 for anything unregistered. */
export function getIdentityClientName(params: {
  clientId: string;
  redirectUri: string;
}) {
  return publicRequestClient.get<{ name: string }>('/identity-bridge/client', {
    params,
  });
}
