import { requestClient } from '#/api/request';

export const sendClientLog = (data: Record<string, any>) => {
  return requestClient.post('/system/log/client', data);
};
