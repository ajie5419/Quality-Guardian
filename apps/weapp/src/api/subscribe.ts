const DISPATCH_TEMPLATE_ID = String(
  import.meta.env.VITE_WX_DISPATCH_SUBSCRIBE_TEMPLATE_ID || '',
);
const PENDING_DISPATCH_TEMPLATE_ID = String(
  import.meta.env.VITE_WX_PENDING_DISPATCH_SUBSCRIBE_TEMPLATE_ID ||
    'phgvEZC0eVmZhA0pgQJf8ufuF-y649JSVs8s5I5SpZM',
);

function getSubscribeTemplateIds(): string[] {
  return [
    ...new Set(
      [DISPATCH_TEMPLATE_ID, PENDING_DISPATCH_TEMPLATE_ID].filter(Boolean),
    ),
  ];
}

export function requestDispatchSubscribeMessage(options?: {
  silent?: boolean;
}) {
  const silent = options?.silent ?? true;
  const templateIds = getSubscribeTemplateIds();
  if (templateIds.length === 0) {
    if (!silent) {
      uni.showToast({ title: '通知模板未配置', icon: 'none' });
    }
    return Promise.resolve(false);
  }
  if (typeof uni.requestSubscribeMessage !== 'function') {
    if (!silent) {
      uni.showToast({ title: '当前环境不支持订阅通知', icon: 'none' });
    }
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    uni.requestSubscribeMessage({
      tmplIds: templateIds,
      fail: () => {
        if (!silent) {
          uni.showToast({ title: '通知授权失败', icon: 'none' });
        }
        resolve(false);
      },
      success: (res: Record<string, unknown>) => {
        const accepted = templateIds.some(
          (templateId) => res[templateId] === 'accept',
        );
        if (!silent) {
          uni.showToast({
            title: accepted ? '已开启派单通知' : '未开启派单通知',
            icon: 'none',
          });
        }
        resolve(accepted);
      },
    });
  });
}
