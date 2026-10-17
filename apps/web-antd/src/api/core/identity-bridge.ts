import { requestClient } from '#/api/request';

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
