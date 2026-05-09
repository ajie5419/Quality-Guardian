import { initPreferences } from '@vben/preferences';
import { unmountGlobalLoading } from '@vben/utils';

import { overridesPreferences } from './preferences';
import { setupClientLogger } from './utils/client-logger';

const PUBLIC_ENTRY_PATHS = new Set([
  '/qms/inspection/requests/entry',
  '/qms/metrology/borrow/entry',
]);

function redirectLegacyPublicEntryPath() {
  if (typeof window === 'undefined') {
    return;
  }

  if (import.meta.env.VITE_ROUTER_HISTORY !== 'hash') {
    return;
  }

  if (!PUBLIC_ENTRY_PATHS.has(window.location.pathname)) {
    return;
  }

  const target = `${window.location.origin}/#${window.location.pathname}${window.location.search}`;
  window.location.replace(target);
}

redirectLegacyPublicEntryPath();

// 启动客户端错误记录
setupClientLogger();
/**
 * 应用初始化完成之后再进行页面加载渲染
 */
async function initApplication() {
  // name用于指定项目唯一标识
  // 用于区分不同项目的偏好设置以及存储数据的key前缀以及其他一些需要隔离的数据
  const env = import.meta.env.PROD ? 'prod' : 'dev';
  const appVersion = import.meta.env.VITE_APP_VERSION;
  const namespace = `${import.meta.env.VITE_APP_NAMESPACE}-${appVersion}-${env}`;

  // app偏好设置初始化
  await initPreferences({
    namespace,
    overrides: overridesPreferences,
  });

  // 启动应用并挂载
  // vue应用主要逻辑及视图
  const { bootstrap } = await import('./bootstrap');
  await bootstrap(namespace);

  // 移除并销毁loading
  unmountGlobalLoading();
}

initApplication();
