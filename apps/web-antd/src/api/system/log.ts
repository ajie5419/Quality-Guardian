import { baseRequestClient } from '#/api/request';

export const sendClientLog = (data: Record<string, any>) => {
  // 客户端日志上报是旁路能力，不能影响主流程，也不能引发未处理异常。
  void baseRequestClient.post('/system/log/client', data).catch(() => {
    // ignore
  });
};
